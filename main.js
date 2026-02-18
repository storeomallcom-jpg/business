import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js";

// ========== Supabase & Wallet Configuration ==========
const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';
const MY_WALLET = '0xD205D6fC050d75360AcBF62d76CbD62B241C4362';

// Note: We use window.supabase because it's loaded via CDN in HTML
const client = window.supabase.createClient(DB_URL, DB_KEY);
let user = null;

const NETWORKS = {
    polygon: { chainId: '0x89', usdtContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    bsc: { chainId: '0x38', usdtContract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }
};

const usdtABI = ["function transfer(address to, uint256 value) public returns (bool)"];

// ========== Wallet & Payment Logic ==========
async function updateWalletUI() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                const addr = accounts[0];
                document.getElementById('wallet-status').innerText = `Wallet: ${addr.substring(0,6)}...${addr.substring(addr.length-4)}`;
                document.getElementById('wallet-status').classList.replace('text-blue-400', 'text-green-400');
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
        const amount = ethers.parseUnits("5", config.decimals); // $5 USDT Top-up

        const tx = await usdtContract.transfer(MY_WALLET, amount);
        alert("Transaction sent! Waiting for confirmation...");
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            updateUserBalance(5.00, tx.hash);
            alert("Payment Successful! Credits added.");
        }
    } catch (err) {
        console.error(err);
        alert("Payment Failed: " + (err.reason || err.message));
    }
};

async function updateUserBalance(amount, hash) {
    if (!user) return;
    const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
    const newBal = parseFloat(profile?.credits || 0) + amount;
    
    await client.from('profiles').update({ credits: newBal }).eq('id', user.id);
    await client.from('crypto_payments').insert({ user_id: user.id, tx_hash: hash, amount_usd: amount });
    
    document.getElementById('balance').innerText = `${newBal.toFixed(2)}`;
}

// ========== Auth Logic ==========
// Attaching to window so HTML buttons can see them (required for modules)
window.handleSignUp = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const ref = localStorage.getItem('ds_referrer');
    const { error } = await client.auth.signUp({ email, password, options: { data: { referrer_id: ref } } });
    if (error) alert(error.message); else alert("Check your email for verification link!");
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

// ========== CHAT & ENGINE INTEGRATION (The New Part) ==========

let selectedFile = null;

document.addEventListener('DOMContentLoaded', () => {
    const fileUploadBtn = document.getElementById('file-upload-btn');
    const fileInput = document.getElementById('file-input');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message-btn');
    const clearFileBtn = document.getElementById('clear-file-btn');

    // Button Listeners
    if(fileUploadBtn) fileUploadBtn.addEventListener('click', () => fileInput.click());
    if(clearFileBtn) clearFileBtn.addEventListener('click', clearSelectedFile);
    if(sendBtn) sendBtn.addEventListener('click', sendMessage);
    
    if(messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    if(fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                selectedFile = e.target.files[0];
                document.getElementById('file-name').innerText = selectedFile.name;
                document.getElementById('file-preview').classList.remove('hidden');
            }
        });
    }
});

function clearSelectedFile() {
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('file-preview').classList.add('hidden');
}

function addMessage(content, isUser = false) {
    const chat = document.getElementById('chat-messages');
    const row = document.createElement('div');
    row.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`;
    
    const bubble = document.createElement('div');
    bubble.className = isUser 
        ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none px-4 py-2 max-w-[85%] border border-blue-500/50' 
        : 'bg-slate-800 text-gray-200 rounded-2xl rounded-tl-none px-4 py-2 max-w-[85%] border border-white/10 prose prose-invert prose-sm';
    
    // Simple markdown parsing for the AI response
    if (!isUser) {
        bubble.innerHTML = formatMarkdown(content);
    } else {
        bubble.textContent = content;
    }

    row.appendChild(bubble);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
}

// Simple formatter to make READMEs look good immediately
function formatMarkdown(text) {
    // Convert newlines to breaks
    let formatted = text.replace(/\n/g, '<br>');
    // Bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Code blocks (simple)
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre class="bg-black/50 p-2 rounded mt-2 text-xs font-mono border border-white/10">$1</pre>');
    // Headers
    formatted = formatted.replace(/# (.*?)(<br>|$)/g, '<h1 class="text-xl font-bold text-blue-400 mt-2">$1</h1>');
    return formatted;
}

// === THE CORE ENGINE LOGIC ===
async function sendMessage() {
    const input = document.getElementById('message-input');
    const loading = document.getElementById('loading-indicator');
    
    let textToSend = input.value.trim();
    
    // Logic: If file is selected, read it and prepend to message
    if (selectedFile) {
        try {
            const fileContent = await selectedFile.text();
            textToSend = `[User uploaded file: ${selectedFile.name}]\n\n${fileContent}\n\nUser Request: ${textToSend}`;
        } catch (e) {
            alert("Error reading file");
            return;
        }
    }

    if (!textToSend) return;

    // 1. CREDIT CHECK
    const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (!profile || parseFloat(profile.credits) < 0.50) {
        alert("Insufficient Balance ($0.50 required). Please Top Up.");
        return;
    }

    // 2. DEDUCT CREDITS
    const newBal = parseFloat(profile.credits) - 0.50;
    const { error: payErr } = await client.from('profiles').update({ credits: newBal }).eq('id', user.id);
    
    if (payErr) {
        alert("Payment Error. Try again.");
        return;
    }
    document.getElementById('balance').innerText = `${newBal.toFixed(2)}`;

    // 3. UI UPDATES
    addMessage(input.value || `Generated README for ${selectedFile ? selectedFile.name : 'code snippet'}`, true);
    input.value = '';
    clearSelectedFile();
    loading.classList.remove('hidden');

    // 4. CALL HUGGING FACE ENGINE
    try {
        // Connect to your Space
        const app = await Client.connect("https://ahmad123456mm-top.hf.space");
        
        // Send request to the ChatInterface endpoint
        const result = await app.predict("/chat", [
            textToSend, 
        ]);

        // Result format from ChatInterface is usually { data: [response_string] }
        const aiReply = result.data[0];
        
        loading.classList.add('hidden');
        addMessage(aiReply, false);

    } catch (err) {
        console.error(err);
        loading.classList.add('hidden');
        // Refund if engine fails? (Optional advanced logic)
        addMessage("⚠️ Connection Error: The engine is warming up or busy. Please try again in 1 minute.", false);
    }
}

// Session Restore
const params = new URLSearchParams(window.location.search);
if (params.get('ref')) localStorage.setItem('ds_referrer', params.get('ref'));

client.auth.getSession().then(({ data: { session } }) => {
    if (session) { user = session.user; showDashboard(); }
});
