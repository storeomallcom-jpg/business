var DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
var DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';

const client = window.supabase.createClient(DB_URL, DB_KEY);
const MY_WALLET = '0xD205D6fC050d75360AcBF62d76CbD62B241C4362';

const NETWORKS = {
    polygon: { chainId: '0x89', usdtContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    bsc: { chainId: '0x38', usdtContract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }
};

const usdtABI = ["function transfer(address to, uint256 value) public returns (bool)"];
let user = null;

// دالة الاتصال بالمحفظة
async function connectWallet() {
    if (!window.ethereum) {
        alert("MetaMask not found! Please install it.");
        return null;
    }
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        console.log("Connected to:", accounts[0]);
        return accounts[0];
    } catch (err) {
        console.error("Connection rejected", err);
        return null;
    }
}

// دالة الدفع (تستدعي الاتصال أولاً)
window.payWithUSDT = async () => {
    const account = await connectWallet();
    if (!account) return; // توقف إذا رفض المستخدم الاتصال

    const networkKey = document.getElementById('crypto-network').value;
    const config = NETWORKS[networkKey];

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        
        // تبديل الشبكة تلقائياً
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: config.chainId }],
        });

        const signer = await provider.getSigner();
        const usdtContract = new ethers.Contract(config.usdtContract, usdtABI, signer);
        const amountToPay = ethers.parseUnits("5", config.decimals);

        const tx = await usdtContract.transfer(MY_WALLET, amountToPay);
        alert("Transaction pending... hash: " + tx.hash);

        const receipt = await tx.wait();
        if (receipt.status === 1) {
            await updateCredits(5.00, tx.hash);
            alert("Success! Credits updated.");
        }
    } catch (err) {
        console.error("Payment Error:", err);
        alert("Transaction failed: " + (err.reason || err.message));
    }
};

// ... (احتفظ بباقي دوال الدخول والأفلييت كما هي في ملفك)
async function updateCredits(amount, hash) {
    const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
    const newBalance = parseFloat(profile.credits) + amount;
    await client.from('profiles').update({ credits: newBalance }).eq('id', user.id);
    await client.from('crypto_payments').insert({ user_id: user.id, tx_hash: hash, amount_usd: amount });
    document.getElementById('balance').innerText = `$${newBalance.toFixed(2)}`;
}

window.handleSignIn = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else { user = data.user; showDashboard(); }
};

async function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    const { data } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (data) document.getElementById('balance').innerText = `$${data.credits.toFixed(2)}`;
}

client.auth.getSession().then(({ data: { session } }) => {
    if (session) { user = session.user; showDashboard(); }
});
