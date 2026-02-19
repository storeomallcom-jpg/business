// ========== CONFIGURATION ==========
const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';

// تنظيف المفتاح من أي رموز مخفية لضمان عدم حدوث خطأ ISO-8859-1
const RAW_KEY = "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";
const GROQ_API_KEY = RAW_KEY.replace(/[^\x20-\x7E]/g, "").trim(); 

const client = window.supabase.createClient(DB_URL, DB_KEY);
let user = null;
let selectedFile = null;
let provider, signer;

// USDT contract addresses (Polygon & BSC)
const USDT_ADDRESSES = {
    polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    bsc: '0x55d398326f99059fF775485246999027B3197955'
};
const RECEIVER_WALLET = '0xYourReceivingWalletAddressHere'; // Replace with your wallet

// ========== BEAUTIFUL MARKDOWN RENDERER (UNCHANGED) ==========
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

// ========== CORE ENGINE (UNCHANGED except credit check/deduct) ==========
async function generateReadme() {
    const input = document.getElementById('message-input');
    const loading = document.getElementById('loading-indicator');
    const chatDisplay = document.getElementById('chat-messages');
    
    if (!selectedFile) return alert("Please upload your code first!");
    if (!user) return alert("You must be logged in!");

    // 1. التحقق من الرصيد في Supabase
    const { data: profile, error: pErr } = await client
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();
    
    if (pErr || !profile) {
        console.error("Profile error:", pErr);
        return alert("Could not verify credits. Please try again.");
    }
    
    if (profile.credits < 0.50) {
        return alert("Insufficient Balance — $0.50 required. Please top up.");
    }

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
                "model": "qwen/qwen3-32b",
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

        // 4. تحديث الرصيد (خصم 0.50)
        const updatedCredits = profile.credits - 0.50;
        await client.from('profiles').update({ credits: updatedCredits }).eq('id', user.id);
        
        // تحديث عرض الرصيد
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

// ========== AUTH FUNCTIONS ==========
async function handleSignUp() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if (!email || !password) return alert("Email and password required.");

    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return alert(error.message);
    
    // بعد التسجيل، نقوم بإنشاء صف في جدول profiles برصيد 0
    if (data.user) {
        await client.from('profiles').insert([{ id: data.user.id, email, credits: 0 }]);
        alert("Account created! Please log in.");
    }
}

async function handleSignIn() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if (!email || !password) return alert("Email and password required.");

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);

    user = data.user;
    await ensureProfile();
    showDashboard();
}

async function handleSignOut() {
    await client.auth.signOut();
    user = null;
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('dashboard-screen').classList.add('hidden');
    document.getElementById('wallet-status').innerText = 'Wallet: Disconnected';
}

// التأكد من وجود بروفايل للمستخدم (إذا لم يكن موجوداً بسبب خطأ)
async function ensureProfile() {
    const { data, error } = await client.from('profiles').select('*').eq('id', user.id).single();
    if (error || !data) {
        // إنشاء بروفايل جديد
        await client.from('profiles').insert([{ 
            id: user.id, 
            email: user.email, 
            credits: 0 
        }]);
    }
}

function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    updateBalanceDisplay();
}

async function updateBalanceDisplay() {
    if (!user) return;
    const { data } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (data) document.getElementById('balance').innerText = data.credits.toFixed(2);
}

// ========== PAYMENT (MetaMask) ==========
async function payWithUSDT() {
    if (!user) return alert("Please log in first.");

    // 1. التحقق من وجود MetaMask
    if (!window.ethereum) return alert("MetaMask not installed!");

    try {
        // 2. طلب الاتصال بالحسابات
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();

        // 3. تحديث واجهة المحفظة
        const address = await signer.getAddress();
        document.getElementById('wallet-status').innerText = `Wallet: ${address.slice(0,6)}...${address.slice(-4)}`;

        // 4. اختيار الشبكة
        const network = document.getElementById('crypto-network').value;
        const chainId = network === 'polygon' ? 137 : 56;
        const usdtAddress = USDT_ADDRESSES[network];

        // 5. التبديل إلى الشبكة المطلوبة
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${chainId.toString(16)}` }],
            });
        } catch (switchError) {
            // إذا لم تكن الشبكة مضافة، نطلب إضافتها
            if (switchError.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: `0x${chainId.toString(16)}`,
                        chainName: network === 'polygon' ? 'Polygon Mainnet' : 'BNB Smart Chain',
                        nativeCurrency: { name: network === 'polygon' ? 'MATIC' : 'BNB', symbol: network === 'polygon' ? 'MATIC' : 'BNB', decimals: 18 },
                        rpcUrls: network === 'polygon' ? ['https://polygon-rpc.com'] : ['https://bsc-dataseed.binance.org/'],
                        blockExplorerUrls: network === 'polygon' ? ['https://polygonscan.com'] : ['https://bscscan.com']
                    }]
                });
            } else {
                throw switchError;
            }
        }

        // 6. إنشاء عقد USDT
        const usdtContract = new ethers.Contract(usdtAddress, [
            'function transfer(address to, uint amount) returns (bool)',
            'function decimals() view returns (uint8)'
        ], signer);

        // 7. تحديد عدد الأصفار العشرية (decimals)
        const decimals = await usdtContract.decimals(); // 6 on Polygon, 18 on BSC
        const amount = ethers.parseUnits('5', decimals); // 5 USDT

        // 8. إرسال التحويل
        const tx = await usdtContract.transfer(RECEIVER_WALLET, amount);
        document.getElementById('wallet-status').innerText = 'Transaction sent, waiting for confirmation...';

        // 9. انتظار التأكيد
        const receipt = await tx.wait();
        if (receipt.status === 1) {
            // 10. تحديث الرصيد في Supabase (إضافة 10 Credits)
            const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
            const newCredits = (profile?.credits || 0) + 10;
            await client.from('profiles').update({ credits: newCredits }).eq('id', user.id);
            
            document.getElementById('wallet-status').innerText = 'Payment confirmed! +10 credits.';
            updateBalanceDisplay();
        } else {
            throw new Error('Transaction failed');
        }
    } catch (err) {
        console.error(err);
        alert('Payment error: ' + err.message);
        document.getElementById('wallet-status').innerText = 'Wallet: Disconnected';
    }
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('file-upload-btn');
    const sendBtn = document.getElementById('send-message-btn');
    const clearFileBtn = document.getElementById('clear-file-btn');

    if (uploadBtn) uploadBtn.onclick = () => fileInput.click();
    if (sendBtn) sendBtn.onclick = generateReadme;
    
    fileInput.onchange = (e) => {
        if (e.target.files[0]) {
            selectedFile = e.target.files[0];
            document.getElementById('file-name').innerText = selectedFile.name;
            document.getElementById('file-preview').classList.remove('hidden');
        }
    };

    if (clearFileBtn) {
        clearFileBtn.onclick = () => {
            selectedFile = null;
            document.getElementById('file-preview').classList.add('hidden');
            fileInput.value = '';
        };
    }

    // استعادة الجلسة إن وجدت
    client.auth.getSession().then(({ data: { session } }) => { 
        if (session) { 
            user = session.user; 
            ensureProfile().then(() => showDashboard());
        } 
    });
});

// جعل الدوال المتعلقة بالـ UI عامة ليتم استدعاؤها من HTML
window.handleSignIn = handleSignIn;
window.handleSignUp = handleSignUp;
window.handleSignOut = handleSignOut;
window.payWithUSDT = payWithUSDT;
