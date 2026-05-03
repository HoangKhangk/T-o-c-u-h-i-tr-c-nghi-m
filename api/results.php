<?php
require_once __DIR__ . '/config.php';
cors();

$method  = $_SERVER['REQUEST_METHOD'];
$id      = isset($_GET['id'])      ? (int) $_GET['id']      : null;
$exam_id = isset($_GET['exam_id']) ? (int) $_GET['exam_id'] : null;
$pdo     = db();

// ─── GET ─────────────────────────────────────────────
if ($method === 'GET') {

    // GET ?id=X  →  1 result + chi tiết từng câu
    if ($id !== null) {
        $st = $pdo->prepare('SELECT * FROM results WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $result = $st->fetch();
        if (!$result) json_err('Không tìm thấy kết quả', 404);

        $st2 = $pdo->prepare(
            'SELECT rd.*, q.content AS question_content,
                    a.content AS answer_content
             FROM result_details rd
             LEFT JOIN questions q ON q.id = rd.question_id
             LEFT JOIN answers   a ON a.id = rd.answer_id
             WHERE rd.result_id = ?
             ORDER BY q.order_num ASC'
        );
        $st2->execute([$id]);
        $result['details'] = $st2->fetchAll();

        json_ok($result);
    }

    // GET ?exam_id=X  →  tất cả results của exam (chỉ owner)
    if ($exam_id !== null) {
        $uid = auth_required();

        // Kiểm tra owner
        $st = $pdo->prepare('SELECT owner_id FROM exams WHERE id = ? LIMIT 1');
        $st->execute([$exam_id]);
        $exam = $st->fetch();
        if (!$exam) json_err('Không tìm thấy đề thi', 404);
        if ((int) $exam['owner_id'] !== $uid) json_err('Bạn không có quyền xem kết quả đề này', 403);

        $st = $pdo->prepare(
            'SELECT r.*, u.username
             FROM results r
             LEFT JOIN users u ON u.id = r.user_id
             WHERE r.exam_id = ?
             ORDER BY r.submitted_at DESC'
        );
        $st->execute([$exam_id]);
        json_ok($st->fetchAll());
    }

    json_err('Thiếu id hoặc exam_id');
}

// ─── POST  (nộp bài) ─────────────────────────────────
if ($method === 'POST') {
    $body = get_body();

    $eid        = (int) ($body['exam_id'] ?? 0);
    $score      = (int) ($body['score']   ?? 0);
    $total      = (int) ($body['total']   ?? 0);
    $duration   = (int) ($body['duration'] ?? 0);
    $guest_name = trim($body['guest_name'] ?? '');
    $answers    = $body['answers'] ?? [];

    if (!$eid)   json_err('Thiếu exam_id');
    if (!$total) json_err('Thiếu tổng số câu');

    // Kiểm tra exam tồn tại
    $st = $pdo->prepare('SELECT id FROM exams WHERE id = ? LIMIT 1');
    $st->execute([$eid]);
    if (!$st->fetch()) json_err('Không tìm thấy đề thi', 404);

    $uid = current_user_id();

    // Nếu guest thì phải có guest_name
    if (!$uid && !$guest_name) json_err('Vui lòng nhập tên người làm bài');

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare(
            'INSERT INTO results (exam_id, user_id, guest_name, score, total, duration)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $st->execute([$eid, $uid, $uid ? null : $guest_name, $score, $total, $duration]);
        $rid = (int) $pdo->lastInsertId();

        if (!empty($answers)) {
            $st2 = $pdo->prepare(
                'INSERT INTO result_details (result_id, question_id, answer_id, is_correct)
                 VALUES (?, ?, ?, ?)'
            );
            foreach ($answers as $a) {
                $qid        = (int) ($a['question_id'] ?? 0);
                $aid        = isset($a['answer_id']) ? (int) $a['answer_id'] : null;
                $is_correct = !empty($a['is_correct']) ? 1 : 0;
                if ($qid) $st2->execute([$rid, $qid, $aid, $is_correct]);
            }
        }

        $pdo->commit();

        $st = $pdo->prepare('SELECT * FROM results WHERE id = ?');
        $st->execute([$rid]);
        json_ok($st->fetch());
    } catch (Exception $e) {
        $pdo->rollBack();
        json_err('Lỗi lưu kết quả: ' . $e->getMessage(), 500);
    }
}

json_err('Method không hợp lệ', 405);
