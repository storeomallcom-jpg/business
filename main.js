// ========== CONFIGURATION ==========
const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';
const GROQ_KEY = "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";
const RECEIVER_WALLET = '0xfF82D591F726eF56313EF958Bb7d7D85866C4E8B'; 

const client = supabase.createClient(DB_URL, DB_KEY);
let user = null;
let selectedFile = null;

// USDT Contracts
const USDT_CONTRACTS = {
    polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    bsc: '0x55d398326f99059fF775485246999027B3197955'
};

// ========== AI ENGINE ==========
async function generateReadme() {
    if (!selectedFile) return alert("Please upload a file first.");
    if (!user) return alert("Please login.");

    // التحقق من الرصيد
    const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (!profile || profile.credits < 0.50) return alert("Insufficient Balance ($0.50 required)");

    const loading = document.getElementById('loading-indicator');
    const chatDisplay = document.getElementById('chat-messages');
    loading.classList.remove('hidden');

    try {
        const fileContent = await selectedFile.text();
        const instructions = document.getElementById('instruction-input').value;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "qwen-qwq-32b",
                "messages": [
                    { "role": "system", "content": "You are a Senior Tech Writer. Generate a masterpiece README.md with professional emojis, tables, and deep technical logic explanation." },
                    { "role": "user", "content": `Instructions: ${instructions}\n\nCode:\n${fileContent.substring(0, 8000)}` }
                ]
            })
        });

        const result = await response.json();
        const readme = result.choices[0].message.content;

        // خصم الرصيد
        const newBalance = profile.credits - 0.50;
        await client.from('profiles').update({ credits: newBalance }).eq('id', user.id);
        document.getElementById('balance').innerText = newBalance.toFixed(2);

        chatDisplay.innerHTML = `
            <div class="glass p-6 rounded-2xl border border-blue-500/20">
                <pre class="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">${readme}</pre>
                <button id="btn-download" class="mt-4 w-full bg-blue-600 p-2 rounded-lg text-xs font-bold">DOWNLOAD .MD</button>
            </div>
        `;

        document.getElementById('btn-download').onclick = () => {
            const blob = new Blob([readme], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = "README.md"; a.click();
        };

    } catch (err) {
        alert("Generation failed: " + err.message);
    } finally {
        loading.classList.add('hidden');
    }
}

// ========== WEB3 PAYMENT (FIXED) ==========
async function buyCredits() {
    if (!window.ethereum) return alert("Please install MetaMask.");
    
    try {
        const network = document.getElementById('crypto-network').value;
        const chainId = network === 'bsc' ? '0x38' : '0x89'; // 56 for BSC, 137 for Polygon
        
        // التبديل للشبكة الصحيحة
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId }],
        });

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const userAddress = await signer.getAddress();
        
        document.getElementById('wallet-status').innerText = `Wallet: ${userAddress.substring(0,6)}...`;

        const contract = new ethers.Contract(USDT_CONTRACTS[network], [
            "function transfer(address to, uint amount) returns (bool)",
            "function decimals() view returns (uint8)"
        ], signer);

        const decimals = await contract.decimals();
        const amount = ethers.parseUnits("5.0", decimals); // شراء بـ 5 دولار

        const tx = await contract.transfer(RECEIVER_WALLET, amount);
        alert("Transaction sent! Waiting for confirmation...");
        
        const receipt = await tx.wait(); // انتظار التأكيد الحقيقي

        if (receipt.status === 1) {
            const { data } = await client.from('profiles').select('credits').eq('id', user.id).single();
            const updatedCredits = (parseFloat(data.credits) || 0) + 10.0; // إضافة 10 دولار رصيد
            await client.from('profiles').update({ credits: updatedCredits }).eq('id', user.id);
            document.getElementById('balance').innerText = updatedCredits.toFixed(2);
            alert("Payment successful! Credits added.");
        }

    } catch (err) {
        console.error(err);
        alert("Payment Error: " + (err.reason || err.message));
    }
}

// ========== AUTH & INIT ==========
document.getElementById('btn-signin').onclick = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    user = data.user;
    initDashboard();
};

document.getElementById('btn-signup').onclick = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await client.auth.signUp({ email, password });
    if (error) return alert(error.message);
    alert("Check email to confirm!");
};

document.getElementById('btn-signout').onclick = () => {
    client.auth.signOut();
    location.reload();
};

async function initDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    const { data } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (data) document.getElementById('balance').innerText = data.credits.toFixed(2);
}

// File Handlers
document.getElementById('btn-upload').onclick = () => document.getElementById('file-input').click();
document.getElementById('file-input').onchange = (e) => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        document.getElementById('file-name').innerText = selectedFile.name;
        document.getElementById('file-preview').classList.remove('hidden');
        document.getElementById('empty-state').classList.add('hidden');
    }
};
document.getElementById('btn-remove-file').onclick = () => {
    selectedFile = null;
    document.getElementById('file-preview').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
};
document.getElementById('btn-generate').onclick = generateReadme;
document.getElementById('btn-topup').onclick = buyCredits;

// Check Session
client.auth.getSession().then(({ data: { session } }) => {
    if (session) { user = session.user; initDashboard(); }
});
