<?php
require_once __DIR__ . '/config.php';
cors();

$method  = $_SERVER['REQUEST_METHOD'];
$id      = isset($_GET['id'])      ? (int) $_GET['id']      : null;
$exam_id = isset($_GET['exam_id']) ? (int) $_GET['exam_id'] : null;
$pdo     = db();

// ─── GET ?exam_id=X ──────────────────────────────────
if ($method === 'GET') {
    if (!$exam_id) json_err('Thiếu exam_id');

    $st = $pdo->prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_num ASC, id ASC');
    $st->execute([$exam_id]);
    $questions = $st->fetchAll();

    foreach ($questions as &$q) {
        $st2 = $pdo->prepare('SELECT * FROM answers WHERE question_id = ? ORDER BY order_num ASC, id ASC');
        $st2->execute([$q['id']]);
        $q['answers'] = $st2->fetchAll();
    }
    json_ok($questions);
}

// ─── POST  (tạo câu hỏi + đáp án) ───────────────────
if ($method === 'POST') {
    $uid  = auth_required();
    $body = get_body();

    $eid     = (int) ($body['exam_id'] ?? 0);
    $content = trim($body['content'] ?? '');
    $answers = $body['answers'] ?? [];

    if (!$eid || !$content)    json_err('Thiếu exam_id hoặc nội dung câu hỏi');
    if (count($answers) < 2)   json_err('Cần ít nhất 2 đáp án');

    // Kiểm tra exam owner
    check_exam_owner($pdo, $eid, $uid);

    $order     = (int) ($body['order_num'] ?? 0);
    $image_url = trim($body['image_url'] ?? '') ?: null;

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare(
            'INSERT INTO questions (exam_id, content, image_url, order_num) VALUES (?, ?, ?, ?)'
        );
        $st->execute([$eid, $content, $image_url, $order]);
        $qid = (int) $pdo->lastInsertId();

        insert_answers($pdo, $qid, $answers);

        $pdo->commit();

        // Trả về câu hỏi vừa tạo kèm đáp án
        $st = $pdo->prepare('SELECT * FROM questions WHERE id = ?');
        $st->execute([$qid]);
        $q = $st->fetch();

        $st2 = $pdo->prepare('SELECT * FROM answers WHERE question_id = ? ORDER BY order_num ASC');
        $st2->execute([$qid]);
        $q['answers'] = $st2->fetchAll();

        json_ok($q);
    } catch (Exception $e) {
        $pdo->rollBack();
        json_err('Lỗi tạo câu hỏi: ' . $e->getMessage(), 500);
    }
}

// ─── PUT  (cập nhật câu hỏi + đáp án) ───────────────
if ($method === 'PUT') {
    $uid = auth_required();
    if (!$id) json_err('Thiếu id');

    $body = get_body();

    // Lấy câu hỏi
    $st = $pdo->prepare('SELECT * FROM questions WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    $q = $st->fetch();
    if (!$q) json_err('Không tìm thấy câu hỏi', 404);

    // Kiểm tra exam owner
    check_exam_owner($pdo, (int) $q['exam_id'], $uid);

    $content   = trim($body['content'] ?? $q['content']);
    $order     = isset($body['order_num']) ? (int) $body['order_num'] : $q['order_num'];
    $image_url = array_key_exists('image_url', $body)
        ? (trim($body['image_url']) ?: null)
        : $q['image_url'];
    $answers   = $body['answers'] ?? [];

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('UPDATE questions SET content=?, image_url=?, order_num=? WHERE id=?');
        $st->execute([$content, $image_url, $order, $id]);

        if (!empty($answers)) {
            if (count($answers) < 2) json_err('Cần ít nhất 2 đáp án');
            $pdo->prepare('DELETE FROM answers WHERE question_id = ?')->execute([$id]);
            insert_answers($pdo, $id, $answers);
        }

        $pdo->commit();

        $st = $pdo->prepare('SELECT * FROM questions WHERE id = ?');
        $st->execute([$id]);
        $updated = $st->fetch();

        $st2 = $pdo->prepare('SELECT * FROM answers WHERE question_id = ? ORDER BY order_num ASC');
        $st2->execute([$id]);
        $updated['answers'] = $st2->fetchAll();

        json_ok($updated);
    } catch (Exception $e) {
        $pdo->rollBack();
        json_err('Lỗi cập nhật: ' . $e->getMessage(), 500);
    }
}

// ─── DELETE ──────────────────────────────────────────
if ($method === 'DELETE') {
    $uid = auth_required();
    if (!$id) json_err('Thiếu id');

    $st = $pdo->prepare('SELECT * FROM questions WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    $q = $st->fetch();
    if (!$q) json_err('Không tìm thấy câu hỏi', 404);

    check_exam_owner($pdo, (int) $q['exam_id'], $uid);

    $pdo->prepare('DELETE FROM result_details WHERE question_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM answers WHERE question_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM questions WHERE id = ?')->execute([$id]);

    json_ok(['deleted_id' => $id]);
}

json_err('Method không hợp lệ', 405);

// ─── HELPERS ─────────────────────────────────────────
function insert_answers(PDO $pdo, int $qid, array $answers): void {
    $st = $pdo->prepare(
        'INSERT INTO answers (question_id, content, is_correct, order_num) VALUES (?, ?, ?, ?)'
    );
    foreach ($answers as $i => $a) {
        $content    = trim($a['content'] ?? '');
        $is_correct = !empty($a['is_correct']) ? 1 : 0;
        $order      = (int) ($a['order_num'] ?? ($i + 1));
        if ($content) $st->execute([$qid, $content, $is_correct, $order]);
    }
}

function check_exam_owner(PDO $pdo, int $exam_id, int $uid): void {
    $st = $pdo->prepare('SELECT owner_id FROM exams WHERE id = ? LIMIT 1');
    $st->execute([$exam_id]);
    $exam = $st->fetch();
    if (!$exam) json_err('Không tìm thấy đề thi', 404);
    if ((int) $exam['owner_id'] !== $uid) json_err('Bạn không có quyền thao tác với đề này', 403);
}
