// ========== CONFIGURATION ==========
const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';
const GROQ_KEY = "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";
const RECEIVER_WALLET = '0xfF82D591F726eF56313EF958Bb7d7D85866C4E8B'; 

const client = supabase.createClient(DB_URL, DB_KEY);
let user = null;
let selectedFile = null;

const USDT_CONTRACTS = {
    polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    bsc: '0x55d398326f99059fF775485246999027B3197955'
};

// ========== AI ENGINE ==========
async function generateReadme() {
    if (!selectedFile) return alert("Upload code first!");
    if (!user) return alert("Login required!");

    const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (!profile || parseFloat(profile.credits) < 0.50) return alert("Insufficient Balance ($0.50 required)");

    const loading = document.getElementById('loading-indicator');
    loading.classList.remove('hidden');

    try {
        const fileContent = await selectedFile.text();
        const instructions = document.getElementById('instruction-input').value;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "qwen-qwq-32b", // هذا الموديل متوفر ومستقر في Groq
                "messages": [
                    { "role": "system", "content": "Expert Technical Writer. Output raw Markdown only." },
                    { "role": "user", "content": `Instructions: ${instructions}\n\nCode Analysis:\n${fileContent.substring(0, 7000)}` }
                ],
                "temperature": 0.6
            })
        });

        const result = await response.json();
        
        // إصلاح خطأ "Cannot read properties of undefined (reading '0')"
        if (!result.choices || result.choices.length === 0) {
            throw new Error(result.error?.message || "AI Error: Invalid response from Groq");
        }

        const readme = result.choices[0].message.content;

        // خصم الرصيد
        const newBalance = parseFloat(profile.credits) - 0.50;
        await client.from('profiles').update({ credits: newBalance }).eq('id', user.id);
        document.getElementById('balance').innerText = newBalance.toFixed(2);

        renderOutput(readme);

    } catch (err) {
        alert("CRITICAL ERROR: " + err.message);
    } finally {
        loading.classList.add('hidden');
    }
}

function renderOutput(readme) {
    const chatDisplay = document.getElementById('chat-messages');
    chatDisplay.innerHTML = `
        <div class="glass p-8 rounded-3xl border border-blue-500/20">
            <div class="flex justify-between mb-4">
                <span class="text-[10px] font-mono text-blue-400">SYNTHESIS COMPLETE</span>
                <button id="btn-download" class="text-blue-500 hover:text-white transition"><i class="fas fa-download"></i></button>
            </div>
            <pre class="text-xs text-blue-100 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">${readme}</pre>
        </div>`;
    
    document.getElementById('btn-download').onclick = () => {
        const blob = new Blob([readme], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = "README.md"; a.click();
    };
}

// ========== WEB3 PAYMENT (FIXED) ==========
async function buyCredits() {
    if (!window.ethereum) return alert("Install MetaMask!");
    
    try {
        const network = document.getElementById('crypto-network').value;
        const chainId = network === 'bsc' ? '0x38' : '0x89';
        
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        const contract = new ethers.Contract(USDT_CONTRACTS[network], [
            "function transfer(address to, uint amount) returns (bool)",
            "function decimals() view returns (uint8)",
            "function balanceOf(address account) view returns (uint256)"
        ], signer);

        const decimals = await contract.decimals();
        const amount = ethers.parseUnits("5.0", decimals);

        // فحص الرصيد قبل الإرسال لمنع خطأ Exceeds Balance
        const balance = await contract.balanceOf(address);
        if (balance < amount) {
            return alert(`Insufficient USDT! You have ${ethers.formatUnits(balance, decimals)} but need 5.0`);
        }

        const tx = await contract.transfer(RECEIVER_WALLET, amount);
        document.getElementById('wallet-status').innerText = "Confirming...";
        
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            const { data } = await client.from('profiles').select('credits').eq('id', user.id).single();
            const updated = (parseFloat(data.credits) || 0) + 10.0;
            await client.from('profiles').update({ credits: updated }).eq('id', user.id);
            document.getElementById('balance').innerText = updated.toFixed(2);
            alert("SUCCESS: 10.00 Credits added!");
        }
    } catch (err) {
        alert("PAYMENT FAILED: " + (err.reason || err.message));
    }
}

// ========== AUTH & BOOTSTRAP ==========
document.getElementById('btn-signin').onclick = async () => {
    const e = document.getElementById('email').value, p = document.getElementById('password').value;
    const { data, error } = await client.auth.signInWithPassword({ email: e, password: p });
    if (error) return alert(error.message);
    user = data.user; setupUI();
};

document.getElementById('btn-signup').onclick = async () => {
    const e = document.getElementById('email').value, p = document.getElementById('password').value;
    const { error } = await client.auth.signUp({ email: e, password: p });
    alert(error ? error.message : "Verification email sent!");
};

async function setupUI() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    const { data } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (data) document.getElementById('balance').innerText = parseFloat(data.credits).toFixed(2);
}

document.getElementById('btn-signout').onclick = () => { client.auth.signOut(); location.reload(); };
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

client.auth.getSession().then(({ data: { session } }) => { if (session) { user = session.user; setupUI(); } });
