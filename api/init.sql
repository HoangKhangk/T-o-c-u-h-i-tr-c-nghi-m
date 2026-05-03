-- Tạo database
CREATE DATABASE IF NOT EXISTS hacka CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hacka;

-- Users
CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    username   VARCHAR(50)  NOT NULL UNIQUE,
    email      VARCHAR(100) NOT NULL UNIQUE,
    password   VARCHAR(255) NOT NULL,
    role       ENUM('user','admin') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Exams
CREATE TABLE IF NOT EXISTS exams (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id    INT NOT NULL,
    is_public   TINYINT(1) NOT NULL DEFAULT 1,
    time_limit  INT NOT NULL DEFAULT 30,
    share_code  VARCHAR(16) NOT NULL UNIQUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- Questions
CREATE TABLE IF NOT EXISTS questions (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    exam_id   INT NOT NULL,
    content   TEXT NOT NULL,
    image_url VARCHAR(500),
    order_num INT NOT NULL DEFAULT 0,
    FOREIGN KEY (exam_id) REFERENCES exams(id)
);

-- Answers
CREATE TABLE IF NOT EXISTS answers (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    content     TEXT NOT NULL,
    is_correct  TINYINT(1) NOT NULL DEFAULT 0,
    order_num   INT NOT NULL DEFAULT 0,
    FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- Results
CREATE TABLE IF NOT EXISTS results (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    exam_id      INT NOT NULL,
    user_id      INT,
    guest_name   VARCHAR(100),
    score        INT NOT NULL DEFAULT 0,
    total        INT NOT NULL DEFAULT 0,
    duration     INT NOT NULL DEFAULT 0,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id)  REFERENCES exams(id),
    FOREIGN KEY (user_id)  REFERENCES users(id)
);

-- Result details
CREATE TABLE IF NOT EXISTS result_details (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    result_id   INT NOT NULL,
    question_id INT NOT NULL,
    answer_id   INT,
    is_correct  TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (result_id)   REFERENCES results(id),
    FOREIGN KEY (question_id) REFERENCES questions(id),
    FOREIGN KEY (answer_id)   REFERENCES answers(id)
);
