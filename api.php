<?php
// ==============================================
// Dev Storeomall V11 - Secure API Middleware
// ==============================================

// Error reporting (disable in production)
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ==============================================
// Configuration (Set these as environment variables in production!)
// ==============================================
$SUPABASE_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
$SUPABASE_SERVICE_KEY = getenv('SUPABASE_SERVICE_KEY') ?: 'your-supabase-service-key-here';
$HF_TOKEN = getenv('HF_TOKEN') ?: 'your-huggingface-token-here';
$TOKENS_PER_LETTER = 4; // 1 token per 4 characters
$AFFILIATE_COMMISSION = 0.1; // 10%

// ==============================================
// Helper Functions
// ==============================================

/**
 * Authenticate user using JWT token
 */
function authenticateUser() {
    global $SUPABASE_URL, $SUPABASE_SERVICE_KEY;
    
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? '';
    
    if (!preg_match('/Bearer\s+(.*)/', $authHeader, $matches)) {
        http_response_code(401);
        echo json_encode(['error' => 'Missing or invalid authorization token']);
        exit;
    }
    
    $token = $matches[1];
    
    // Verify token with Supabase
    $ch = curl_init($SUPABASE_URL . '/auth/v1/user');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'apikey: ' . $SUPABASE_SERVICE_KEY,
        'Authorization: Bearer ' . $token
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid or expired token']);
        exit;
    }
    
    $user = json_decode($response, true);
    if (!$user || !isset($user['id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid user data']);
        exit;
    }
    
    return $user;
}

/**
 * Get user profile data from Supabase
 */
function getUserProfile($userId) {
    global $SUPABASE_URL, $SUPABASE_SERVICE_KEY;
    
    $ch = curl_init($SUPABASE_URL . '/rest/v1/profiles?id=eq.' . urlencode($userId) . '&select=*');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'apikey: ' . $SUPABASE_SERVICE_KEY,
        'Authorization: Bearer ' . $SUPABASE_SERVICE_KEY
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        return null;
    }
    
    $profiles = json_decode($response, true);
    return $profiles[0] ?? null;
}

/**
 * Update user credits in Supabase
 */
function updateUserCredits($userId, $newCredits) {
    global $SUPABASE_URL, $SUPABASE_SERVICE_KEY;
    
    $ch = curl_init($SUPABASE_URL . '/rest/v1/profiles?id=eq.' . urlencode($userId));
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['credits' => $newCredits]));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'apikey: ' . $SUPABASE_SERVICE_KEY,
        'Authorization: Bearer ' . $SUPABASE_SERVICE_KEY,
        'Content-Type: application/json'
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return $httpCode === 200 || $httpCode === 204;
}

/**
 * Add affiliate commission to referrer
 */
function addAffiliateCommission($referrerId, $amount) {
    global $SUPABASE_URL, $SUPABASE_SERVICE_KEY, $AFFILIATE_COMMISSION;
    
    // Get referrer's current credits
    $profile = getUserProfile($referrerId);
    if (!$profile) return false;
    
    $commission = floor($amount * $AFFILIATE_COMMISSION);
    $newCredits = ($profile['credits'] ?? 0) + $commission;
    
    // Update referrer's credits
    return updateUserCredits($referrerId, $newCredits);
}

/**
 * Call Hugging Face model
 */
function callHuggingFace($prompt) {
    global $HF_TOKEN;
    
    $ch = curl_init('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['inputs' => $prompt]));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $HF_TOKEN,
        'Content-Type: application/json'
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        return ['error' => 'Hugging Face API error: ' . $httpCode];
    }
    
    $data = json_decode($response, true);
    
    if (isset($data[0]['generated_text'])) {
        return ['text' => $data[0]['generated_text']];
    } elseif (isset($data['error'])) {
        return ['error' => $data['error']];
    } else {
        return ['error' => 'Unknown response from model'];
    }
}

/**
 * Verify crypto transaction (simplified - in production, use actual blockchain RPC)
 */
function verifyCryptoTransaction($txHash, $network, $expectedAmount) {
    // In production, you would:
    // 1. Connect to network RPC (Polygon/BSC)
    // 2. Fetch transaction details
    // 3. Verify recipient address and amount
    // 4. Check confirmations
    
    // For demo, we'll simulate verification
    // Always return true for demo purposes
    return [
        'verified' => true,
        'amount' => $expectedAmount,
        'confirmations' => 12
    ];
}

// ==============================================
// Route Handler
// ==============================================

$action = $_GET['action'] ?? '';

switch ($action) {
    
    // ==============================================
    // AI Chat Endpoint
    // ==============================================
    case 'ai_chat':
        $user = authenticateUser();
        $input = json_decode(file_get_contents('php://input'), true);
        $prompt = $input['prompt'] ?? '';
        
        if (empty($prompt)) {
            echo json_encode(['error' => 'Empty prompt']);
            exit;
        }
        
        // Get user's current credits
        $profile = getUserProfile($user['id']);
        $credits = $profile['credits'] ?? 0;
        
        // Call Hugging Face model
        $hfResult = callHuggingFace($prompt);
        
        if (isset($hfResult['error'])) {
            echo json_encode(['error' => $hfResult['error']]);
            exit;
        }
        
        $outputText = $hfResult['text'];
        
        // Calculate token cost
        $inputLen = strlen($prompt);
        $outputLen = strlen($outputText);
        $tokensUsed = ceil(($inputLen + $outputLen) / $GLOBALS['TOKENS_PER_LETTER']);
        
        // Check if user has enough credits
        if ($credits < $tokensUsed) {
            echo json_encode([
                'error' => 'Insufficient credits',
                'balance' => $credits,
                'tokens_needed' => $tokensUsed
            ]);
            exit;
        }
        
        $newCredits = $credits - $tokensUsed;
        
        // Update credits in database
        if (!updateUserCredits($user['id'], $newCredits)) {
            echo json_encode(['error' => 'Failed to update credits']);
            exit;
        }
        
        echo json_encode([
            'reply' => $outputText,
            'tokens_used' => $tokensUsed,
            'new_balance' => $newCredits
        ]);
        break;
    
    // ==============================================
    // Verify Payment Endpoint
    // ==============================================
    case 'verify_payment':
        $user = authenticateUser();
        $input = json_decode(file_get_contents('php://input'), true);
        
        $txHash = $input['txHash'] ?? '';
        $network = $input['network'] ?? 'POLYGON';
        $amount = $input['amount'] ?? 0; // Amount in USD
        
        if (empty($txHash) || $amount <= 0) {
            echo json_encode(['error' => 'Invalid payment data']);
            exit;
        }
        
        // Verify transaction on blockchain
        $verification = verifyCryptoTransaction($txHash, $network, $amount);
        
        if (!$verification['verified']) {
            echo json_encode(['error' => 'Transaction verification failed']);
            exit;
        }
        
        // Calculate tokens to add (e.g., $1 = 100 tokens)
        $tokensToAdd = $amount * 100;
        
        // Get current credits
        $profile = getUserProfile($user['id']);
        $oldCredits = $profile['credits'] ?? 0;
        $newCredits = $oldCredits + $tokensToAdd;
        
        // Update user credits
        if (!updateUserCredits($user['id'], $newCredits)) {
            echo json_encode(['error' => 'Failed to update credits']);
            exit;
        }
        
        // Record payment in crypto_payments table
        $ch = curl_init($SUPABASE_URL . '/rest/v1/crypto_payments');
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'user_id' => $user['id'],
            'tx_hash' => $txHash,
            'network' => $network,
            'amount_usdt' => $amount,
            'tokens_added' => $tokensToAdd,
            'status' => 'completed'
        ]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'apikey: ' . $SUPABASE_SERVICE_KEY,
            'Authorization: Bearer ' . $SUPABASE_SERVICE_KEY,
            'Content-Type: application/json'
        ]);
        curl_exec($ch);
        curl_close($ch);
        
        // Handle affiliate commission
        if (!empty($profile['referred_by'])) {
            addAffiliateCommission($profile['referred_by'], $tokensToAdd);
        }
        
        echo json_encode([
            'success' => true,
            'new_balance' => $newCredits,
            'tokens_added' => $tokensToAdd
        ]);
        break;
    
    // ==============================================
    // Claim Social Reward Endpoint
    // ==============================================
    case 'claim_social_reward':
        $user = authenticateUser();
        $input = json_decode(file_get_contents('php://input'), true);
        
        $platform = $input['platform'] ?? '';
        
        if (!in_array($platform, ['youtube', 'instagram'])) {
            echo json_encode(['error' => 'Invalid platform']);
            exit;
        }
        
        // Check if user already claimed this reward
        $ch = curl_init($SUPABASE_URL . '/rest/v1/social_rewards?user_id=eq.' . urlencode($user['id']) . '&reward_type=eq.' . urlencode($platform));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'apikey: ' . $SUPABASE_SERVICE_KEY,
            'Authorization: Bearer ' . $SUPABASE_SERVICE_KEY
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode === 200) {
            $existing = json_decode($response, true);
            if (!empty($existing)) {
                echo json_encode(['error' => 'You already claimed this reward']);
                exit;
            }
        }
        
        // Reward amount
        $rewardAmount = 50; // 50 tokens per social claim
        
        // Get current credits
        $profile = getUserProfile($user['id']);
        $oldCredits = $profile['credits'] ?? 0;
        $newCredits = $oldCredits + $rewardAmount;
        
        // Update credits
        if (!updateUserCredits($user['id'], $newCredits)) {
            echo json_encode(['error' => 'Failed to update credits']);
            exit;
        }
        
        // Record claim
        $ch = curl_init($SUPABASE_URL . '/rest/v1/social_rewards');
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'user_id' => $user['id'],
            'reward_type' => $platform
        ]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'apikey: ' . $SUPABASE_SERVICE_KEY,
            'Authorization: Bearer ' . $SUPABASE_SERVICE_KEY,
            'Content-Type: application/json'
        ]);
        curl_exec($ch);
        curl_close($ch);
        
        echo json_encode([
            'success' => true,
            'new_balance' => $newCredits,
            'amount' => $rewardAmount
        ]);
        break;
    
    // ==============================================
    // Set Referrer Endpoint
    // ==============================================
    case 'set_referrer':
        $user = authenticateUser();
        $input = json_decode(file_get_contents('php://input'), true);
        
        $referrerId = $input['referrer_id'] ?? '';
        
        if (empty($referrerId)) {
            echo json_encode(['error' => 'Missing referrer ID']);
            exit;
        }
        
        // Don't allow self-referral
        if ($referrerId === $user['id']) {
            echo json_encode(['error' => 'Cannot refer yourself']);
            exit;
        }
        
        // Check if referrer exists
        $referrer = getUserProfile($referrerId);
        if (!$referrer) {
            echo json_encode(['error' => 'Referrer not found']);
            exit;
        }
        
        // Update user's profile with referrer
        $ch = curl_init($SUPABASE_URL . '/rest/v1/profiles?id=eq.' . urlencode($user['id']));
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['referred_by' => $referrerId]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'apikey: ' . $SUPABASE_SERVICE_KEY,
            'Authorization: Bearer ' . $SUPABASE_SERVICE_KEY,
            'Content-Type: application/json'
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        // Record in referrals table
        $ch = curl_init($SUPABASE_URL . '/rest/v1/referrals');
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'referrer_id' => $referrerId,
            'referred_id' => $user['id'],
            'status' => 'pending'
        ]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'apikey: ' . $SUPABASE_SERVICE_KEY,
            'Authorization: Bearer ' . $SUPABASE_SERVICE_KEY,
            'Content-Type: application/json'
        ]);
        curl_exec($ch);
        curl_close($ch);
        
        echo json_encode(['success' => true]);
        break;
    
    // ==============================================
    // Get Balance Endpoint
    // ==============================================
    case 'get_balance':
        $user = authenticateUser();
        
        $profile = getUserProfile($user['id']);
        $balance = $profile['credits'] ?? 0;
        
        echo json_encode(['balance' => $balance]);
        break;
    
    // ==============================================
    // Get Referrals Endpoint
    // ==============================================
    case 'get_referrals':
        $user = authenticateUser();
        
        $ch = curl_init($SUPABASE_URL . '/rest/v1/referrals?referrer_id=eq.' . urlencode($user['id']) . '&select=*');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'apikey: ' . $SUPABASE_SERVICE_KEY,
            'Authorization: Bearer ' . $SUPABASE_SERVICE_KEY
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            echo json_encode(['error' => 'Failed to fetch referrals']);
            exit;
        }
        
        $referrals = json_decode($response, true);
        
        echo json_encode(['referrals' => $referrals]);
        break;
    
    // ==============================================
    // Health Check Endpoint
    // ==============================================
    case 'health':
        echo json_encode([
            'status' => 'healthy',
            'timestamp' => time(),
            'version' => 'v11'
        ]);
        break;
    
    // ==============================================
    // Invalid Action
    // ==============================================
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
        break;
}
