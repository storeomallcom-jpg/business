const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';

const client = window.supabase.createClient(DB_URL, DB_KEY);
const MY_WALLET = '0xD205D6fC050d75360AcBF62d76CbD62B241C4362';

// إعدادات العقود الذكية لعملة USDT
const NETWORKS = {
    polygon: {
        chainId: '0x89', // 137 in Hex
        usdtContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        decimals: 6
    },
    bsc: {
        chainId: '0x38', // 56 in Hex
        usdtContract: '0x55d398326f99059fF775485246999027B3197955',
        decimals: 18
    }
};

// ABI مصغر يحتوي فقط على وظيفة "التحويل" لتوفير الطاقة وتقليل الأخطاء
const usdtABI = ["function transfer(address to, uint256 value) public returns (bool)"];

let user = null;
const authMsg = document.getElementById('auth-msg');

// ==========================================
// 1. نظام الدفع بـ USDT (Web3)
// ==========================================
window.payWithUSDT = async () => {
    if (!window.ethereum) return alert("Please install MetaMask!");

    const networkKey = document.getElementById('crypto-network').value;
    const config = NETWORKS[networkKey];

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        
        // إجبار المحفظة على التبديل للشبكة الصحيحة
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: config.chainId }],
            });
        } catch (switchError) {
            return alert("Please switch to the correct network in MetaMask first.");
        }

        const signer = await provider.getSigner();
        
        // الاتصال بعقد الـ USDT
        const usdtContract = new ethers.Contract(config.usdtContract, usdtABI, signer);
        
        // تجهيز المبلغ (5 دولار) مع مراعاة الأصفار الخاصة بكل شبكة
        const amountToPay = ethers.parseUnits("5", config.decimals);

        alert("Approve the transaction in MetaMask to send 5 USDT...");

        // تنفيذ التحويل
        const tx = await usdtContract.transfer(MY_WALLET, amountToPay);
        console.log("Tx Hash:", tx.hash);
        alert("Transaction submitted! Waiting for confirmation...");

        // انتظار التأكيد من البلوكشين
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            await updateCredits(5.00, tx.hash);
            alert("Payment Successful! $5 USDT added to your balance.");
        }

    } catch (err) {
        console.error("Payment Error:", err);
        alert("Payment failed or rejected.");
    }
};

async function updateCredits(amount, hash) {
    const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
    const newBalance = parseFloat(profile.credits) + amount;

    await client.from('profiles').update({ credits: newBalance }).eq('id', user.id);
    
    // تسجيل العملية
    await client.from('crypto_payments').insert({ user_id: user.id, tx_hash: hash, amount_usd: amount });
    document.getElementById('balance').innerText = `$${newBalance.toFixed(2)}`;
}

// ==========================================
// 2. نظام الدخول الأساسي (تم إصلاحه)
// ==========================================
window.handleSignUp = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const ref = localStorage.getItem('ds_referrer');
    
    if(!email || !password) return authMsg.innerText = "Missing fields!";
    authMsg.innerText = "Creating account...";
    
    const { error } = await client.auth.signUp({
        email, password, options: { data: { referrer_id: ref } }
    });

    if (error) authMsg.innerText = error.message;
    else authMsg.innerText = "Success! Verify email.";
};

window.handleSignIn = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    authMsg.innerText = "Logging in...";
    
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) authMsg.innerText = error.message;
    else { user = data.user; showDashboard(); }
};

window.handleSignOut = async () => {
    await client.auth.signOut();
    location.reload();
};

async function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    
    const { data } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (data) document.getElementById('balance').innerText = `$${data.credits.toFixed(2)}`;
}

// تتبع الأفلييت تلقائياً
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('ref')) localStorage.setItem('ds_referrer', urlParams.get('ref'));

// التحقق من الجلسة عند فتح الموقع
client.auth.getSession().then(({ data: { session } }) => {
    if (session) { user = session.user; showDashboard(); }
});
