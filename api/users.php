<?php
require_once __DIR__ . '/config.php';
cors();

$method = $_SERVER['REQUEST_METHOD'];
$body   = get_body();

// GET ?action=me
if ($method === 'GET') {
    if (!empty($_SESSION['user_id'])) {
        json_ok([
            'id'       => $_SESSION['user_id'],
            'username' => $_SESSION['username'],
            'email'    => $_SESSION['email'],
            'role'     => $_SESSION['role'],
        ]);
    }
    json_err('Chưa đăng nhập', 401);
}

if ($method !== 'POST') json_err('Method không hợp lệ', 405);

$action = $body['action'] ?? '';

// ─── REGISTER ────────────────────────────────────────
if ($action === 'register') {
    $username = trim($body['username'] ?? '');
    $email    = trim($body['email'] ?? '');
    $password = $body['password'] ?? '';

    if (!$username || !$email || !$password) json_err('Vui lòng điền đầy đủ thông tin');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL))  json_err('Email không hợp lệ');
    if (strlen($password) < 6) json_err('Mật khẩu phải có ít nhất 6 ký tự');

    $pdo = db();

    $st = $pdo->prepare('SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1');
    $st->execute([$email, $username]);
    if ($st->fetch()) json_err('Email hoặc username đã tồn tại');

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $st = $pdo->prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, "user")');
    $st->execute([$username, $email, $hash]);
    $id = (int) $pdo->lastInsertId();

    $_SESSION['user_id']  = $id;
    $_SESSION['username'] = $username;
    $_SESSION['email']    = $email;
    $_SESSION['role']     = 'user';

    json_ok(['id' => $id, 'username' => $username, 'email' => $email, 'role' => 'user']);
}

// ─── LOGIN ───────────────────────────────────────────
if ($action === 'login') {
    $email    = trim($body['email'] ?? '');
    $password = $body['password'] ?? '';

    if (!$email || !$password) json_err('Vui lòng điền đầy đủ thông tin');

    $pdo = db();
    $st  = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $st->execute([$email]);
    $user = $st->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        json_err('Email hoặc mật khẩu không đúng', 401);
    }

    $_SESSION['user_id']  = (int) $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['email']    = $user['email'];
    $_SESSION['role']     = $user['role'];

    json_ok([
        'id'       => (int) $user['id'],
        'username' => $user['username'],
        'email'    => $user['email'],
        'role'     => $user['role'],
    ]);
}

// ─── LOGOUT ──────────────────────────────────────────
if ($action === 'logout') {
    session_destroy();
    json_ok(null);
}

json_err('Action không hợp lệ');
