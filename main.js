var DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
var DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';
var MY_WALLET = '0xD205D6fC050d75360AcBF62d76CbD62B241C4362';

const client = window.supabase.createClient(DB_URL, DB_KEY);
let user = null;

const NETWORKS = {
    polygon: { chainId: '0x89', usdtContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    bsc: { chainId: '0x38', usdtContract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }
};

const usdtABI = ["function transfer(address to, uint256 value) public returns (bool)"];

// دالة لتحديث واجهة المحفظة
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
        // التنبيه لخطأ الرصيد تحديداً
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

// نظام الدخول
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
    updateWalletUI(); // فحص المحفظة عند فتح اللوحة
}

const params = new URLSearchParams(window.location.search);
if (params.get('ref')) localStorage.setItem('ds_referrer', params.get('ref'));

client.auth.getSession().then(({ data: { session } }) => {
    if (session) { user = session.user; showDashboard(); }
});
