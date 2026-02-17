// Supabase configuration
const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';
const MY_WALLET = '0xD205D6fC050d75360AcBF62d76CbD62B241C4362';

const client = window.supabase.createClient(DB_URL, DB_KEY);
let user = null;

const NETWORKS = {
    polygon: { chainId: '0x89', usdtContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    bsc: { chainId: '0x38', usdtContract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }
};

const usdtABI = ["function transfer(address to, uint256 value) public returns (bool)"];

// ========== Wallet & Payment Functions (unchanged) ==========
async function updateWalletUI() {
    if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            const addr = accounts[0];
            document.getElementById('wallet-status').innerText = `Wallet: ${addr.substring(0,6)}...${addr.substring(addr.length-4)}`;
            document.getElementById('wallet-status').classList.replace('text-blue-400', 'text-green-400');
            return true;
        }
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
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: config.chainId }],
            });
        } catch (e) {
            alert("Switching network to " + networkKey);
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const usdtContract = new ethers.Contract(config.usdtContract, usdtABI, signer);
        const amount = ethers.parseUnits("5", config.decimals);

        const tx = await usdtContract.transfer(MY_WALLET, amount);
        alert("Transaction sent! Hash: " + tx.hash);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            updateUserBalance(5.00, tx.hash);
            alert("Payment Successful!");
        }
    } catch (err) {
        console.error(err);
        if (err.message.includes("exceeds balance")) {
            alert("Error: You don't have enough USDT on this network!");
        } else {
            alert("Payment Failed: " + (err.reason || err.message));
        }
    }
};

async function updateUserBalance(amount, hash) {
    const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
    const newBal = parseFloat(profile.credits || 0) + amount;
    await client.from('profiles').update({ credits: newBal }).eq('id', user.id);
    await client.from('crypto_payments').insert({ user_id: user.id, tx_hash: hash, amount_usd: amount });
    document.getElementById('balance').innerText = `$${newBal.toFixed(2)}`;
}

// ========== Auth Functions (unchanged) ==========
window.handleSignUp = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const ref = localStorage.getItem('ds_referrer');
    const { error } = await client.auth.signUp({ email, password, options: { data: { referrer_id: ref } } });
    if (error) alert(error.message); else alert("Verify your email!");
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
    if (data) document.getElementById('balance').innerText = `$${data.credits.toFixed(2)}`;
    updateWalletUI();
}

// ========== New Chat Functions ==========

let selectedFile = null;

// File upload handling
document.addEventListener('DOMContentLoaded', () => {
    const fileUploadBtn = document.getElementById('file-upload-btn');
    const fileInput = document.getElementById('file-input');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message-btn');

    fileUploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            document.getElementById('file-name').innerText = selectedFile.name;
            document.getElementById('file-preview').classList.remove('hidden');
        } else {
            clearSelectedFile();
        }
    });

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});

function clearSelectedFile() {
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('file-preview').classList.add('hidden');
}

// Placeholder AI function (replace with Hugging Face later)
async function fetchAIResponse(prompt, file) {
    // Simulate API call
    return new Promise(resolve => {
        setTimeout(() => {
            let response = `AI response to: "${prompt}"`;
            if (file) response += `\n(File "${file.name}" received)`;
            resolve(response);
        }, 1000);
    });
}

// Add message to chat
function addMessage(content, isUser = false) {
    const chat = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`;
    
    const bubble = document.createElement('div');
    bubble.className = `${
        isUser 
            ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none' 
            : 'bg-slate-800 text-white rounded-2xl rounded-tl-none'
    } px-4 py-2 max-w-[80%]`;
    
    bubble.innerHTML = `<p class="text-sm whitespace-pre-wrap">${content}</p>`;
    messageDiv.appendChild(bubble);
    chat.appendChild(messageDiv);
    chat.scrollTop = chat.scrollHeight;
}

// Core send function with credit check
async function sendMessage() {
    const input = document.getElementById('message-input');
    const prompt = input.value.trim();
    if (!prompt && !selectedFile) return;

    // 1. Check if user has enough credits
    const { data: profile, error: fetchError } = await client
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();

    if (fetchError || !profile) {
        alert('Error fetching user credits.');
        return;
    }

    const credits = parseFloat(profile.credits) || 0;
    if (credits < 0.5) {
        alert('Insufficient balance! Please Top Up.');
        return;
    }

    // 2. Deduct $0.50
    const newCredits = credits - 0.5;
    const { error: updateError } = await client
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', user.id);

    if (updateError) {
        alert('Error deducting credits. Please try again.');
        return;
    }

    // Update UI balance
    document.getElementById('balance').innerText = `$${newCredits.toFixed(2)}`;

    // 3. Add user message to chat
    addMessage(prompt, true);

    // 4. Clear input and file preview (keep file for AI? We'll pass it)
    input.value = '';
    const fileToSend = selectedFile;
    clearSelectedFile(); // removes preview

    // 5. Call AI and display response
    try {
        const aiResponse = await fetchAIResponse(prompt, fileToSend);
        addMessage(aiResponse, false);
    } catch (err) {
        console.error('AI error:', err);
        addMessage('Sorry, an error occurred while processing your request.', false);
    }
}

// ========== Session Handling ==========
const params = new URLSearchParams(window.location.search);
if (params.get('ref')) localStorage.setItem('ds_referrer', params.get('ref'));

client.auth.getSession().then(({ data: { session } }) => {
    if (session) { user = session.user; showDashboard(); }
});
