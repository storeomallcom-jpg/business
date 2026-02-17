var DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
var DB_KEY = 'YOUR_ANON_KEY';
const MY_WALLET = '0xD205D6fC050d75360AcBF62d76CbD62B241C4362';

const client = supabase.createClient(DB_URL, DB_KEY);
let user = null;

// --- نظام الدفع بالكريبتو ---
window.handleCryptoPayment = async () => {
    if (!window.ethereum) return alert("Please install MetaMask!");

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        // مبلغ الدفع (مثلاً 0.005 ETH أو ما يعادله بالعملة الأصلية للشبكة)
        // هنا نرسل عملة الشبكة (Native Token)
        const amount = ethers.parseEther("0.001"); 

        alert("Opening MetaMask to send $5 equivalent...");

        const tx = await signer.sendTransaction({
            to: MY_WALLET,
            value: amount
        });

        console.log("Transaction Sent:", tx.hash);
        alert("Transaction pending... Please wait.");

        // انتظار التأكيد من البلوكشين
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            // تحديث الرصيد في قاعدة البيانات بعد نجاح الدفع
            await updateCreditsAfterPayment(5.00, tx.hash);
            alert("Payment Successful! $5 added to your balance.");
        }

    } catch (err) {
        console.error(err);
        alert("Payment failed or cancelled.");
    }
};

async function updateCreditsAfterPayment(amount, hash) {
    // 1. إضافة الرصيد للمستخدم
    const { data: profile } = await client.from('profiles').select('credits').eq('id', user.id).single();
    const newBalance = parseFloat(profile.credits) + amount;

    await client.from('profiles').update({ credits: newBalance }).eq('id', user.id);
    
    // 2. تسجيل العملية في جدول الدفعات للتوثيق
    await client.from('crypto_payments').insert({
        user_id: user.id,
        tx_hash: hash,
        amount_usd: amount
    });

    document.getElementById('balance').innerText = `$${newBalance.toFixed(2)}`;
}

// --- الدوال الأساسية (Sign In / Up) ---
// (انسخ دوال handleSignIn و handleSignUp من الكود السابق الذي يعمل عندك)

async function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    
    const { data } = await client.from('profiles').select('credits').eq('id', user.id).single();
    if (data) document.getElementById('balance').innerText = `$${data.credits.toFixed(2)}`;
}

client.auth.getSession().then(({ data: { session } }) => {
    if (session) { user = session.user; showDashboard(); }
});
