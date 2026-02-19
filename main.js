// ========== CONFIG ==========
const SUPABASE_URL = 'https://xtgttdwovdgsqvdwmvwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Z3R0ZHdvdmRnc3F2ZHdtdndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwMTYwMDAsImV4cCI6MjA1NTU5MjAwMH0.dummy'; // replace with your actual anon key

const GROQ_API_KEY = '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'; // your Groq key
const RECEIVER_WALLET = '0xfF82D591F726eF56313EF958Bb7d7D85866C4E8B'; // USDT receiver

const REFERRAL_BONUS = 200;       // tokens given to referrer
const SIGNUP_BONUS = 1000;        // free tokens on signup
const GENERATION_COST = 0.50;

const USDT_ADDRESSES = {
    bsc: '0x55d398326f99059fF775485246999027B3197955',
    polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
};

// ========== SUPABASE CLIENT ==========
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let selectedFile = null;
let provider, signer;

// ========== UTILS ==========
function showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
}

function updateBalanceDisplay() {
    if (!currentUser) return;
    supabase.from('profiles').select('credits').eq('id', currentUser.id).single().then(({ data }) => {
        if (data) document.getElementById('balance').innerText = data.credits.toFixed(2);
    });
}

function displayMessage(html, isError = false) {
    const chat = document.getElementById('chat-messages');
    chat.innerHTML = html;
}

// ========== AUTH ==========
window.handleSignUp = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if (!email || !password) return alert('Email and password required');

    // Check for referral code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return alert(error.message);
    if (!data.user) return;

    // Create profile with signup bonus
    const { error: profileError } = await supabase.from('profiles').insert([{
        id: data.user.id,
        email,
        credits: SIGNUP_BONUS,
        referral_code: generateReferralCode(data.user.id),
        referred_by: null
    }]);

    if (profileError) console.error('Profile creation error', profileError);

    // If referred, give bonus to referrer
    if (refCode) {
        const { data: referrer } = await supabase.from('profiles').select('id').eq('referral_code', refCode).single();
        if (referrer) {
            await supabase.rpc('add_referral_bonus', { referrer_id: referrer.id, new_user_id: data.user.id });
        }
    }

    alert('Account created! Please log in.');
};

window.handleSignIn = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);

    currentUser = data.user;
    await ensureProfile();
    showDashboard();
};

window.handleSignOut = async () => {
    await supabase.auth.signOut();
    currentUser = null;
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('dashboard-screen').classList.add('hidden');
};

async function ensureProfile() {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (error || !data) {
        // fallback: create profile if missing
        await supabase.from('profiles').insert([{
            id: currentUser.id,
            email: currentUser.email,
            credits: SIGNUP_BONUS,
            referral_code: generateReferralCode(currentUser.id)
        }]);
    }
}

function generateReferralCode(userId) {
    return userId.slice(0, 8); // simple, you can use nanoid etc.
}

function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    updateBalanceDisplay();
    updateReferralLink();
}

function updateReferralLink() {
    if (!currentUser) return;
    supabase.from('profiles').select('referral_code').eq('id', currentUser.id).single().then(({ data }) => {
        if (data?.referral_code) {
            const link = `${window.location.origin}${window.location.pathname}?ref=${data.referral_code}`;
            document.getElementById('referral-link').innerText = link;
        }
    });
}

window.copyReferral = () => {
    const text = document.getElementById('referral-link').innerText;
    navigator.clipboard.writeText(text);
    alert('Referral link copied!');
};

// ========== AI GENERATION ==========
async function generateReadme() {
    if (!currentUser) return alert('Login first');
    if (!selectedFile) return alert('Upload a code file');

    // Check balance
    const { data: profile, error } = await supabase.from('profiles').select('credits').eq('id', currentUser.id).single();
    if (error || !profile) return alert('Cannot verify credits');
    if (profile.credits < GENERATION_COST) return alert(`Insufficient balance – need ${GENERATION_COST} 🪙`);

    showLoading(true);
    displayMessage(`<div class="text-center py-20 text-blue-400 animate-pulse">🔮 Qwen is analyzing your code...</div>`);

    try {
        const fileContent = await selectedFile.text();
        const extraPrompt = document.getElementById('prompt').value;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'qwen-2.5-32b',
                messages: [
                    {
                        role: 'system',
                        content: `You are an elite technical writer. Generate a stunning README.md with:
- Professional emojis for each section
- A "Tech Stack" table
- "Quick Start", "Installation", "Architecture" sections
- Deep code explanation like a senior engineer
Output only raw markdown.`
                    },
                    {
                        role: 'user',
                        content: `User notes: ${extraPrompt}\n\nCode:\n${fileContent.slice(0, 12000)}`
                    }
                ],
                temperature: 0.6,
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Groq error');
        }

        const result = await response.json();
        const markdown = result.choices[0].message.content;

        // Deduct tokens
        const newBalance = profile.credits - GENERATION_COST;
        await supabase.from('profiles').update({ credits: newBalance }).eq('id', currentUser.id);
        updateBalanceDisplay();

        showLoading(false);
        displayMessage(`
            <div class="bg-slate-800/40 p-6 rounded-3xl border border-white/10">
                <div class="text-xs text-blue-400 mb-4 font-mono">✨ Generated by Qwen-32B</div>
                <div class="markdown-body">${formatMarkdown(markdown)}</div>
                <button id="download-btn" class="mt-6 w-full bg-blue-600 hover:bg-blue-500 p-4 rounded-xl font-bold">⬇️ DOWNLOAD README.md</button>
            </div>
        `);

        document.getElementById('download-btn').onclick = () => {
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'README.md';
            a.click();
        };

    } catch (err) {
        showLoading(false);
        displayMessage(`<div class="bg-red-900/20 border border-red-500 p-4 rounded-xl text-red-400">❌ ${err.message}</div>`, true);
        console.error(err);
    }
}

// Simple markdown formatter (same as before)
function formatMarkdown(text) {
    return text
        .replace(/^# (.*$)/gm, '<h1 class="text-3xl font-bold text-blue-400 my-4">$1</h1>')
        .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold text-blue-300 mt-6 mb-2 border-b border-white/10 pb-1">$1</h2>')
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-700/60 text-pink-300 px-1 py-0.5 rounded">$1</code>')
        .replace(/```([\s\S]*?)```/g, '<pre class="bg-black/60 p-4 rounded-xl overflow-x-auto font-mono text-green-300 text-sm">$1</pre>')
        .replace(/\n/g, '<br>');
}

// ========== WEB3 PAYMENT ==========
window.payWithUSDT = async () => {
    if (!currentUser) return alert('Login first');
    if (!window.ethereum) return alert('MetaMask not found');

    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        const address = await signer.getAddress();
        document.getElementById('wallet-badge').innerHTML = `💳 ${address.slice(0,6)}...${address.slice(-4)}`;

        const network = document.getElementById('network').value;
        const chainId = network === 'bsc' ? 56 : 137;
        const usdtAddress = USDT_ADDRESSES[network];

        // Switch network
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${chainId.toString(16)}` }]
            });
        } catch (switchErr) {
            if (switchErr.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: `0x${chainId.toString(16)}`,
                        chainName: network === 'bsc' ? 'BNB Smart Chain' : 'Polygon Mainnet',
                        nativeCurrency: {
                            name: network === 'bsc' ? 'BNB' : 'MATIC',
                            symbol: network === 'bsc' ? 'BNB' : 'MATIC',
                            decimals: 18
                        },
                        rpcUrls: network === 'bsc' ? ['https://bsc-dataseed.binance.org/'] : ['https://polygon-rpc.com'],
                        blockExplorerUrls: network === 'bsc' ? ['https://bscscan.com'] : ['https://polygonscan.com']
                    }]
                });
            } else throw switchErr;
        }

        // USDT contract
        const usdt = new ethers.Contract(usdtAddress, [
            'function transfer(address to, uint amount) returns (bool)',
            'function decimals() view returns (uint8)'
        ], signer);

        const decimals = await usdt.decimals();  // 18 for BSC, 6 for Polygon
        const amount = ethers.parseUnits('5', decimals); // 5 USDT

        document.getElementById('wallet-badge').innerHTML = '⏳ Sending...';
        const tx = await usdt.transfer(RECEIVER_WALLET, amount);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            // Add 1000 tokens
            const { data: profile } = await supabase.from('profiles').select('credits').eq('id', currentUser.id).single();
            const newCredits = (profile?.credits || 0) + 1000;
            await supabase.from('profiles').update({ credits: newCredits }).eq('id', currentUser.id);
            updateBalanceDisplay();
            document.getElementById('wallet-badge').innerHTML = '✅ +1000 🪙';
            setTimeout(() => {
                document.getElementById('wallet-badge').innerHTML = `💳 ${address.slice(0,6)}...${address.slice(-4)}`;
            }, 3000);
        } else {
            throw new Error('Transaction failed');
        }
    } catch (err) {
        console.error(err);
        alert('Payment error: ' + err.message);
        document.getElementById('wallet-badge').innerHTML = '💳 disconnected';
    }
};

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    // File upload
    document.getElementById('upload-btn').onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = (e) => {
        if (e.target.files[0]) {
            selectedFile = e.target.files[0];
            document.getElementById('file-name').innerText = selectedFile.name;
            document.getElementById('file-preview').classList.remove('hidden');
        }
    };
    document.getElementById('clear-file').onclick = () => {
        selectedFile = null;
        document.getElementById('file-preview').classList.add('hidden');
        document.getElementById('file-input').value = '';
    };

    document.getElementById('generate-btn').onclick = generateReadme;

    // Session restore
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            currentUser = session.user;
            ensureProfile().then(() => showDashboard());
        }
    });
});

// ========== SQL FUNCTION (for referral bonus) ==========
// This function must exist in Supabase. See schema.sql below.
