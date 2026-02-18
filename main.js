// ========== CONFIGURATION ==========
const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';

// تنظيف المفتاح من أي رموز مخفية لضمان عدم حدوث خطأ ISO-8859-1
const RAW_KEY = "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";
const GROQ_API_KEY = RAW_KEY.replace(/[^\x20-\x7E]/g, "").trim(); 

const client = window.supabase.createClient(DB_URL, DB_KEY);
let user = null;
let selectedFile = null;

// ========== BEAUTIFUL MARKDOWN RENDERER ==========
function formatMarkdown(text) {
    if (!text) return "";
    // حذف مقدمات الذكاء الاصطناعي المعتادة
    let cleanText = text.replace(/^(Certainly|Here is|Sure|I've generated).*\n/gi, "");
    
    return cleanText
        .replace(/^# (.*$)/gm, '<h1 class="text-3xl font-black text-blue-400 my-6 tracking-tight">$1</h1>')
        .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold text-blue-300 mt-8 mb-4 border-b border-white/10 pb-2">$1</h2>')
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-700/50 text-pink-400 px-1.5 py-0.5 rounded font-mono text-xs">$1</code>')
        .replace(/```([\s\S]*?)```/g, '<pre class="bg-black/60 p-5 rounded-2xl my-6 border border-white/5 overflow-x-auto font-mono text-green-400 text-xs leading-relaxed">$1</pre>')
        .replace(/\n/g, '<br>');
}

// ========== CORE ENGINE (FIXED & CLEANED) ==========
async function generateReadme() {
    const input = document.getElementById('message-input');
    const loading = document.getElementById('loading-indicator');
    const chatDisplay = document.getElementById('chat-messages');
    
    if (!selectedFile) return alert("Please upload your code first!");

    // 1. التحقق من الرصيد في Supabase
    const { data: profile, error: pErr } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (pErr || profile.credits < 0.50) return alert("Insufficient Balance ($0.50 required)");

    loading.classList.remove('hidden');
    chatDisplay.innerHTML = `<div class="text-center py-20 animate-pulse font-mono text-blue-400 italic font-bold">QWEN AI IS ANALYZING YOUR CODE...</div>`;

    try {
        let fileContent = await selectedFile.text();

        // 2. إعداد الرؤوس (Headers) بشكل آمن
        const requestHeaders = new Headers();
        requestHeaders.append("Authorization", "Bearer " + GROQ_API_KEY);
        requestHeaders.append("Content-Type", "application/json");

        // 3. الطلب الموحد لـ Groq API
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify({
                "model": "qwen/qwen3-32b", // هذا هو الموديل الأذكى المتاح لك حالياً
                "messages": [
                    { 
                        "role": "system", 
                        "content": `You are an expert Technical Writer. Generate a world-class README.md. 
                        - Use professional emojis for each section.
                        - Add a 'Tech Stack' section with a clean table.
                        - Include 'Quick Start', 'Installation', and 'Architecture' sections.
                        - Explain the code logic deeply like a Senior Engineer.
                        - Output ONLY raw markdown.` 
                    },
                    { 
                        "role": "user", 
                        "content": `User Instructions: ${input.value}\n\nCode to analyze:\n${fileContent.substring(0, 10000)}` 
                    }
                ],
                "temperature": 0.6,
                "max_tokens": 4096
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "Groq Error");
        }

        const result = await response.json();
        const finalReadme = result.choices[0].message.content;

        // 4. تحديث الرصيد وعرض النتيجة
        const updatedCredits = profile.credits - 0.50;
        await client.from('profiles').update({ credits: updatedCredits }).eq('id', user.id);
        document.getElementById('balance').innerText = updatedCredits.toFixed(2);

        loading.classList.add('hidden');
        chatDisplay.innerHTML = `
            <div class="bg-slate-800/40 p-8 rounded-3xl border border-white/10 relative group shadow-2xl">
                <div class="absolute -top-3 left-6 bg-blue-600 text-[10px] px-3 py-1 rounded-full font-mono uppercase font-bold tracking-tighter">Powered by Qwen-32B</div>
                <div class="markdown-body">${formatMarkdown(finalReadme)}</div>
                <button id="dl-final" class="mt-8 w-full bg-blue-600 hover:bg-blue-500 p-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20">Download README.md</button>
            </div>`;

        document.getElementById('dl-final').onclick = () => {
            const blob = new Blob([finalReadme], { type: 'text/markdown' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); 
            a.download = "README.md"; 
            a.click();
        };

    } catch (err) {
        console.error("Critical Failure:", err);
        loading.classList.add('hidden');
        chatDisplay.innerHTML = `<div class="bg-red-900/20 border border-red-500/50 p-6 rounded-2xl text-red-400 text-center font-mono">
            <p class="font-bold">SYSTEM ERROR</p>
            <p class="text-sm opacity-80">${err.message}</p>
        </div>`;
    }
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('file-upload-btn');
    const sendBtn = document.getElementById('send-message-btn');

    if (uploadBtn) uploadBtn.onclick = () => fileInput.click();
    if (sendBtn) sendBtn.onclick = generateReadme;
    
    fileInput.onchange = (e) => {
        if (e.target.files[0]) {
            selectedFile = e.target.files[0];
            document.getElementById('file-name').innerText = selectedFile.name;
            document.getElementById('file-preview').classList.remove('hidden');
        }
    };
});

// Auth Session Handling
client.auth.getSession().then(({ data: { session } }) => { 
    if (session) { 
        user = session.user; 
        showDashboard(); 
    } 
});

function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    client.from('profiles').select('credits').eq('id', user.id).single().then(({data}) => {
        if(data) document.getElementById('balance').innerText = data.credits.toFixed(2);
    });
}
