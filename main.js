// ========== Configuration & Initialisation ==========
const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';
const MY_WALLET = '0xD205D6fC050d75360AcBF62d76CbD62B241C4362';
const HF_TOKEN = "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"; 

const client = window.supabase.createClient(DB_URL, DB_KEY);
let user = null;
let selectedFile = null;

const NETWORKS = {
    polygon: { chainId: '0x89', usdtContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    bsc: { chainId: '0x38', usdtContract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }
};

const usdtABI = ["function transfer(address to, uint256 value) public returns (bool)"];

// ========== Wallet Logic ==========
async function updateWalletUI() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                const addr = accounts[0];
                const statusEl = document.getElementById('wallet-status');
                if(statusEl) {
                    statusEl.innerText = `Wallet: ${addr.substring(0,6)}...${addr.substring(addr.length-4)}`;
                    statusEl.classList.replace('text-blue-400', 'text-green-400');
                }
                return true;
            }
        } catch (e) { console.error(e); }
    }
    return false;
}

window.payWithUSDT = async () => {
    if (typeof window.ethereum === 'undefined') return alert("Please install MetaMask!");
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        await updateWalletUI();
        const networkKey = document.getElementById('crypto-network').value;
        const config = NETWORKS[networkKey];
        try {
            await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: config.chainId }] });
        } catch (e) { alert("Switch to " + networkKey); return; }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const usdtContract = new ethers.Contract(config.usdtContract, usdtABI, signer);
        const amount = ethers.parseUnits("5", config.decimals);

        const tx = await usdtContract.transfer(MY_WALLET, amount);
        const receipt = await tx.wait();
        if (receipt.status === 1) updateUserBalance(5.00, tx.hash);
    } catch (err) { alert("Payment Failed: " + err.message); }
};

async function updateUserBalance(amount, hash) {
    if (!user) return;
    const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
    const newBal = parseFloat(profile?.credits || 0) + amount;
    await client.from('profiles').update({ credits: newBal }).eq('id', user.id);
    document.getElementById('balance').innerText = `${newBal.toFixed(2)}`;
}

// ========== Auth Logic ==========
window.handleSignUp = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await client.auth.signUp({ email, password });
    if (error) alert(error.message); else alert("Check email!");
};

window.handleSignIn = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) alert(error.message); else { user = data.user; showDashboard(); }
};

window.handleSignOut = async () => { await client.auth.signOut(); location.reload(); };

async function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    const { data } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (data) document.getElementById('balance').innerText = `${data.credits.toFixed(2)}`;
    updateWalletUI();
}

// ========== UI Helpers & Markdown ==========
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('file-upload-btn').onclick = () => document.getElementById('file-input').click();
    document.getElementById('clear-file-btn').onclick = clearSelectedFile;
    document.getElementById('send-message-btn').onclick = generateReadme;
    document.getElementById('file-input').onchange = (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            document.getElementById('file-name').innerText = selectedFile.name;
            document.getElementById('file-preview').classList.remove('hidden');
        }
    };
});

function clearSelectedFile() {
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('file-preview').classList.add('hidden');
}

function formatMarkdown(text) {
    return text
        .replace(/^# (.*?)$/gm, '<h1 class="text-2xl font-bold text-blue-400 my-4">$1</h1>')
        .replace(/^## (.*?)$/gm, '<h2 class="text-xl font-bold text-blue-300 mt-4 mb-2">$2</h2>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/```([\s\S]*?)```/g, '<pre class="bg-black/50 p-4 rounded-lg my-3 border border-white/10 overflow-x-auto font-mono text-green-400 text-xs">$1</pre>')
        .replace(/\n/g, '<br>');
}

// ========== THE CORE README ENGINE ($0.50 Logic) ==========
async function generateReadme() {
    const input = document.getElementById('message-input');
    const loading = document.getElementById('loading-indicator');
    const chat = document.getElementById('chat-messages');
    let userTask = input.value.trim();

    if (!selectedFile) return alert("Please upload a file first!");

    const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (!profile || profile.credits < 0.50) return alert("Insufficient Balance ($0.50 required)");

    chat.innerHTML = '<div class="text-center text-blue-400 animate-pulse font-mono text-sm mt-10">ANALYZING ENGINE STARTING...</div>';
    loading.classList.remove('hidden');

    try {
        const fileContent = await selectedFile.text();
        const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "deepseek-ai/DeepSeek-V3",
                "messages": [{ "role": "user", "content": `Generate professional README.md for this code. User instructions: ${userTask}\n\nCODE:\n${fileContent}` }],
                "max_tokens": 3000
            })
        });

        const result = await response.json();
        if (result.choices) {
            const readme = result.choices[0].message.content;
            
            // 💰 DEDUCT CREDITS
            const newBal = profile.credits - 0.50;
            await client.from('profiles').update({ credits: newBal }).eq(user.id);
            document.getElementById('balance').innerText = newBal.toFixed(2);

            loading.classList.add('hidden');
            chat.innerHTML = `
                <div class="bg-slate-800 p-6 rounded-2xl border border-white/10 shadow-2xl relative group">
                    <button onclick="navigator.clipboard.writeText(\`${readme.replace(/`/g, '\\`')}\`)" class="absolute top-4 right-4 bg-blue-600 text-xs px-3 py-1 rounded">Copy</button>
                    <div class="prose prose-invert max-w-none">${formatMarkdown(readme)}</div>
                    <button id="dl-btn" class="mt-6 w-full bg-green-600 p-3 rounded-xl font-bold">⬇️ Download README.md</button>
                </div>`;
            
            document.getElementById('dl-btn').onclick = () => {
                const blob = new Blob([readme], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = "README.md"; a.click();
            };
        }
    } catch (e) { alert("Engine Error"); loading.classList.add('hidden'); }
}

client.auth.getSession().then(({ data: { session } }) => { if (session) { user = session.user; showDashboard(); } });
