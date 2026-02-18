// ========== CONFIGURATION ==========
const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';

// تأكد من وضع API Key الخاص بـ Groq هنا وليس Hugging Face
const GROQ_API_KEY = "ضع_هنا_مفتاح_GROQ_الخاص_بك"; 

const client = window.supabase.createClient(DB_URL, DB_KEY);
let user = null;
let selectedFile = null;

// ========== BEAUTIFUL MARKDOWN RENDERER ==========
function formatMarkdown(text) {
    if (!text) return "";
    // تنظيف أي لغو من الذكاء الاصطناعي في البداية
    let cleanText = text.replace(/^(Certainly|Here is|Sure|I've generated).*\n/gi, "");
    
    return cleanText
        .replace(/^# (.*$)/gm, '<h1 class="text-3xl font-black text-blue-400 my-6 tracking-tight">$1</h1>')
        .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold text-blue-300 mt-8 mb-4 border-b border-white/10 pb-2">$1</h2>')
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-700/50 text-pink-400 px-1.5 py-0.5 rounded font-mono text-xs">$1</code>')
        .replace(/```([\s\S]*?)```/g, '<pre class="bg-black/60 p-5 rounded-2xl my-6 border border-white/5 overflow-x-auto font-mono text-green-400 text-xs leading-relaxed">$1</pre>')
        .replace(/\n/g, '<br>');
}

// ========== CORE ENGINE (GROQ DIRECT) ==========
async function generateReadme() {
    const input = document.getElementById('message-input');
    const loading = document.getElementById('loading-indicator');
    const chatDisplay = document.getElementById('chat-messages');
    
    if (!selectedFile) return alert("Please upload your code first!");

    // 1. فحص الرصيد في Supabase
    const { data: profile, error: pErr } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (pErr || profile.credits < 0.50) return alert("Insufficient Balance ($0.50 required)");

    loading.classList.remove('hidden');
    chatDisplay.innerHTML = `<div class="text-center py-20 animate-pulse font-mono text-blue-400">CONNECTING TO GROQ AI...</div>`;

    try {
        let fileContent = await selectedFile.text();

        // 2. الاتصال المباشر بـ Groq (لاحظ تغيير الرابط تماماً)
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${GROQ_API_KEY}`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({
                "model": "llama-3.3-70b-versatile", // الموديل القوي الذي رأيته في صورتك
                "messages": [
                    { "role": "system", "content": "Output ONLY raw markdown README. No conversational text." },
                    { "role": "user", "content": `Instruction: ${input.value}\nCode:\n${fileContent.substring(0, 10000)}` }
                ],
                "temperature": 0.2
            })
        });

        // إذا ظل يعطيك خطأ متعلق بـ Hugging Face، فهذا يعني أنك لم تحفظ الملف أو أن المتصفح يستخدم نسخة قديمة (Cache)
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "Groq Connection Failed");
        }

        const result = await response.json();
        const finalReadme = result.choices[0].message.content;

        // 3. الخصم من الرصيد وعرض النتيجة
        const newCredits = profile.credits - 0.50;
        await client.from('profiles').update({ credits: newCredits }).eq('id', user.id);
        document.getElementById('balance').innerText = newCredits.toFixed(2);

        loading.classList.add('hidden');
        chatDisplay.innerHTML = `
            <div class="bg-slate-800/40 p-8 rounded-3xl border border-white/10 shadow-2xl relative animate-fade-in">
                <div class="absolute -top-3 left-6 bg-blue-600 text-[10px] px-3 py-1 rounded-full font-mono uppercase">Groq: Llama 3.3</div>
                <button onclick="navigator.clipboard.writeText(\`${finalReadme.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)" 
                        class="absolute top-6 right-6 bg-white/5 hover:bg-blue-600 text-white text-[10px] font-bold px-4 py-2 rounded-lg transition-all">Copy</button>
                <div class="markdown-body">${formatMarkdown(finalReadme)}</div>
                <button id="dl-final" class="mt-8 w-full bg-blue-600 p-4 rounded-xl font-black uppercase tracking-widest hover:bg-blue-500 transition-all">Download .md</button>
            </div>`;

        document.getElementById('dl-final').onclick = () => {
            const blob = new Blob([finalReadme], { type: 'text/markdown' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = "README.md"; a.click();
        };

    } catch (err) {
        console.error(err);
        loading.classList.add('hidden');
        chatDisplay.innerHTML = `<p class="text-red-400 text-center py-10 font-mono">CONNECTION ERROR: ${err.message}</p>`;
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
