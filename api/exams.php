<?php
require_once __DIR__ . '/config.php';
cors();

$method  = $_SERVER['REQUEST_METHOD'];
$id      = isset($_GET['id']) ? (int) $_GET['id'] : null;
$share   = $_GET['share_code'] ?? null;
$pdo     = db();

// ─── GET ─────────────────────────────────────────────
if ($method === 'GET') {

    // GET ?share_code=X  →  lấy theo share code (public)
    if ($share !== null) {
        $st = $pdo->prepare('SELECT * FROM exams WHERE share_code = ? LIMIT 1');
        $st->execute([$share]);
        $exam = $st->fetch();
        if (!$exam) json_err('Không tìm thấy đề thi', 404);
        $exam['questions'] = get_questions_with_answers($pdo, $exam['id']);
        json_ok($exam);
    }

    // GET ?id=X  →  lấy 1 exam + questions
    if ($id !== null) {
        $st = $pdo->prepare('SELECT * FROM exams WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $exam = $st->fetch();
        if (!$exam) json_err('Không tìm thấy đề thi', 404);

        // Kiểm tra quyền: public hoặc owner
        $uid = current_user_id();
        if (!$exam['is_public'] && $exam['owner_id'] !== $uid) {
            json_err('Bạn không có quyền xem đề này', 403);
        }

        $exam['questions'] = get_questions_with_answers($pdo, $id);
        json_ok($exam);
    }

    // GET (no params)  →  danh sách: public + của user đang login
    $uid = current_user_id();
    if ($uid) {
        $st = $pdo->prepare(
            'SELECT e.*, u.username AS owner_name,
                    (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count
             FROM exams e
             LEFT JOIN users u ON u.id = e.owner_id
             WHERE e.is_public = 1 OR e.owner_id = ?
             ORDER BY e.id DESC'
        );
        $st->execute([$uid]);
    } else {
        $st = $pdo->prepare(
            'SELECT e.*, u.username AS owner_name,
                    (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count
             FROM exams e
             LEFT JOIN users u ON u.id = e.owner_id
             WHERE e.is_public = 1
             ORDER BY e.id DESC'
        );
        $st->execute([]);
    }
    json_ok($st->fetchAll());
}

// ─── POST  (tạo mới) ─────────────────────────────────
if ($method === 'POST') {
    $uid  = auth_required();
    $body = get_body();

    $title = trim($body['title'] ?? '');
    if (!$title) json_err('Tên đề thi không được để trống');

    $desc      = trim($body['description'] ?? '');
    $is_public = !empty($body['is_public']) ? 1 : 0;
    $time      = max(1, (int) ($body['time_limit'] ?? 30));
    $code      = bin2hex(random_bytes(4));

    $st = $pdo->prepare(
        'INSERT INTO exams (title, description, owner_id, is_public, time_limit, share_code)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $st->execute([$title, $desc, $uid, $is_public, $time, $code]);
    $new_id = (int) $pdo->lastInsertId();

    $st = $pdo->prepare('SELECT * FROM exams WHERE id = ?');
    $st->execute([$new_id]);
    json_ok($st->fetch());
}

// ─── PUT  (cập nhật) ─────────────────────────────────
if ($method === 'PUT') {
    $uid = auth_required();
    if (!$id) json_err('Thiếu id');

    $exam = exam_owner_check($pdo, $id, $uid);
    $body = get_body();

    $title     = trim($body['title'] ?? $exam['title']);
    $desc      = trim($body['description'] ?? $exam['description']);
    $is_public = isset($body['is_public']) ? ($body['is_public'] ? 1 : 0) : $exam['is_public'];
    $time      = isset($body['time_limit']) ? max(1, (int) $body['time_limit']) : $exam['time_limit'];

    $st = $pdo->prepare(
        'UPDATE exams SET title=?, description=?, is_public=?, time_limit=? WHERE id=?'
    );
    $st->execute([$title, $desc, $is_public, $time, $id]);

    $st = $pdo->prepare('SELECT * FROM exams WHERE id = ?');
    $st->execute([$id]);
    json_ok($st->fetch());
}

// ─── DELETE ──────────────────────────────────────────
if ($method === 'DELETE') {
    $uid = auth_required();
    if (!$id) json_err('Thiếu id');

    exam_owner_check($pdo, $id, $uid);

    // Xóa cascade: result_details → results → answers → questions → exam
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'DELETE rd FROM result_details rd
             JOIN results r ON r.id = rd.result_id
             WHERE r.exam_id = ?'
        )->execute([$id]);

        $pdo->prepare('DELETE FROM results WHERE exam_id = ?')->execute([$id]);

        $pdo->prepare(
            'DELETE a FROM answers a
             JOIN questions q ON q.id = a.question_id
             WHERE q.exam_id = ?'
        )->execute([$id]);

        $pdo->prepare('DELETE FROM questions WHERE exam_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM exams WHERE id = ?')->execute([$id]);

        $pdo->commit();
        json_ok(['deleted_id' => $id]);
    } catch (Exception $e) {
        $pdo->rollBack();
        json_err('Xóa thất bại: ' . $e->getMessage(), 500);
    }
}

json_err('Method không hợp lệ', 405);

// ─── HELPERS ─────────────────────────────────────────
function get_questions_with_answers(PDO $pdo, int $exam_id): array {
    $st = $pdo->prepare(
        'SELECT * FROM questions WHERE exam_id = ? ORDER BY order_num ASC, id ASC'
    );
    $st->execute([$exam_id]);
    $questions = $st->fetchAll();

    foreach ($questions as &$q) {
        $st2 = $pdo->prepare(
            'SELECT * FROM answers WHERE question_id = ? ORDER BY order_num ASC, id ASC'
        );
        $st2->execute([$q['id']]);
        $q['answers'] = $st2->fetchAll();
    }
    return $questions;
}

function exam_owner_check(PDO $pdo, int $exam_id, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM exams WHERE id = ? LIMIT 1');
    $st->execute([$exam_id]);
    $exam = $st->fetch();
    if (!$exam) json_err('Không tìm thấy đề thi', 404);
    if ((int) $exam['owner_id'] !== $uid) json_err('Bạn không có quyền thao tác với đề này', 403);
    return $exam;
}
