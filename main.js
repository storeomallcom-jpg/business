// ========== CONFIGURATION ==========
const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';

// انتبه: تأكد من وضع المفتاح بين علامتي التنصيص وبدون أي مسافات زائدة
const GROQ_API_KEY = "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".trim(); 

const client = window.supabase.createClient(DB_URL, DB_KEY);
let user = null;
let selectedFile = null;

// ========== BEAUTIFUL MARKDOWN RENDERER ==========
function formatMarkdown(text) {
    if (!text) return "";
    let cleanText = text.replace(/^(Certainly|Here is|Sure|I've generated).*\n/gi, "");
    
    return cleanText
        .replace(/^# (.*$)/gm, '<h1 class="text-3xl font-black text-blue-400 my-6 tracking-tight">$1</h1>')
        .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold text-blue-300 mt-8 mb-4 border-b border-white/10 pb-2">$1</h2>')
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-700/50 text-pink-400 px-1.5 py-0.5 rounded font-mono text-xs">$1</code>')
        .replace(/```([\s\S]*?)```/g, '<pre class="bg-black/60 p-5 rounded-2xl my-6 border border-white/5 overflow-x-auto font-mono text-green-400 text-xs leading-relaxed">$1</pre>')
        .replace(/\n/g, '<br>');
}

// ========== CORE ENGINE (GROQ STABLE) ==========
async function generateReadme() {
    const input = document.getElementById('message-input');
    const loading = document.getElementById('loading-indicator');
    const chatDisplay = document.getElementById('chat-messages');
    
    if (!selectedFile) return alert("Please upload your code first!");

    // 1. فحص الرصيد
    const { data: profile, error: pErr } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (pErr || profile.credits < 0.50) return alert("Insufficient Balance ($0.50 required)");

    loading.classList.remove('hidden');
    chatDisplay.innerHTML = `<div class="text-center py-20 animate-pulse font-mono text-blue-400">CONNECTING TO GROQ NEURAL LINK...</div>`;

    try {
        let fileContent = await selectedFile.text();

        // 2. طلب الـ API مع تنظيف الرؤوس (Headers)
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": "Bearer " + GROQ_API_KEY, // الربط اليدوي لضمان عدم وجود رموز غريبة
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    { "role": "system", "content": "Professional README generator. ONLY raw markdown." },
                    { "role": "user", "content": `Code:\n${fileContent.substring(0, 10000)}` }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "Groq Error");
        }

        const result = await response.json();
        const finalReadme = result.choices[0].message.content;

        // 3. الخصم والإنهاء
        await client.from('profiles').update({ credits: profile.credits - 0.50 }).eq('id', user.id);
        document.getElementById('balance').innerText = (profile.credits - 0.50).toFixed(2);

        loading.classList.add('hidden');
        chatDisplay.innerHTML = `
            <div class="bg-slate-800/40 p-8 rounded-3xl border border-white/10 relative">
                <div class="markdown-body">${formatMarkdown(finalReadme)}</div>
                <button id="dl-final" class="mt-8 w-full bg-blue-600 p-4 rounded-xl font-black">Download .md</button>
            </div>`;

        document.getElementById('dl-final').onclick = () => {
            const blob = new Blob([finalReadme], { type: 'text/markdown' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = "README.md"; a.click();
        };

    } catch (err) {
        console.error(err);
        loading.classList.add('hidden');
        chatDisplay.innerHTML = `<p class="text-red-400 text-center py-10">ERROR: ${err.message}</p>`;
    }
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('file-upload-btn').onclick = () => document.getElementById('file-input').click();
    document.getElementById('send-message-btn').onclick = generateReadme;
    document.getElementById('file-input').onchange = (e) => {
        if (e.target.files[0]) {
            selectedFile = e.target.files[0];
            document.getElementById('file-name').innerText = selectedFile.name;
            document.getElementById('file-preview').classList.remove('hidden');
        }
    };
});

client.auth.getSession().then(({ data: { session } }) => { 
    if (session) { user = session.user; showDashboard(); } 
});

function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    client.from('profiles').select('credits').eq('id', user.id).single().then(({data}) => {
        if(data) document.getElementById('balance').innerText = data.credits.toFixed(2);
    });
}
