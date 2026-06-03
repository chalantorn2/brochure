<?php

declare(strict_types=1);

session_start([
    'cookie_httponly' => true,
    'cookie_samesite' => 'Lax',
]);

$config = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

try {
    ensure_upload_dir($config['upload_dir']);
    route($config);
} catch (Throwable $exception) {
    json_response(['error' => $exception->getMessage()], 500);
}

function route(array $config): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');

    if ($scriptDir && str_starts_with($path, $scriptDir)) {
        $path = substr($path, strlen($scriptDir));
    }

    $path = '/' . trim($path, '/');

    if ($method === 'GET' && $path === '/brochures') {
        list_tours($config);
        return;
    }

    if ($method === 'POST' && $path === '/admin/login') {
        admin_login($config);
        return;
    }

    if ($method === 'GET' && $path === '/admin/session') {
        json_response(['authenticated' => !empty($_SESSION['admin'])]);
        return;
    }

    if ($method === 'POST' && $path === '/admin/logout') {
        $_SESSION = [];
        session_destroy();
        json_response(['ok' => true]);
        return;
    }

    if ($method === 'POST' && $path === '/admin/brochures') {
        require_admin();
        create_tour($config);
        return;
    }

    if ($method === 'POST' && preg_match('#^/admin/brochures/(\d+)$#', $path, $matches)) {
        require_admin();
        update_tour($config, (int) $matches[1]);
        return;
    }

    if ($method === 'DELETE' && preg_match('#^/admin/brochures/(\d+)$#', $path, $matches)) {
        require_admin();
        delete_tour($config, (int) $matches[1]);
        return;
    }

    json_response(['error' => 'Endpoint not found.'], 404);
}

function variant_definitions(): array
{
    return [
        ['field' => 'brochure_seven_smile_th', 'brand' => 'seven_smile', 'language' => 'th'],
        ['field' => 'brochure_seven_smile_en', 'brand' => 'seven_smile', 'language' => 'en'],
        ['field' => 'brochure_indo_smile_th', 'brand' => 'indo_smile', 'language' => 'th'],
        ['field' => 'brochure_indo_smile_en', 'brand' => 'indo_smile', 'language' => 'en'],
        ['field' => 'brochure_no_logo_th', 'brand' => 'no_logo', 'language' => 'th'],
        ['field' => 'brochure_no_logo_en', 'brand' => 'no_logo', 'language' => 'en'],
    ];
}

function db(array $config): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $db = $config['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host'],
        $db['port'],
        $db['name'],
        $db['charset']
    );

    $pdo = new PDO($dsn, $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function list_tours(array $config): void
{
    $tours = db($config)->query(
        'SELECT id, title, province, adult_price, child_price, park_included,
                thai_adult_park_fee, thai_child_park_fee,
                foreigner_adult_park_fee, foreigner_child_park_fee,
                note, created_at, updated_at
         FROM tours
         ORDER BY created_at DESC, id DESC'
    )->fetchAll();

    $files = db($config)->query(
        'SELECT id, tour_id, brand, language, file_name, original_name,
                mime_type, file_size, created_at
         FROM brochure_files
         ORDER BY brand ASC, language DESC, id ASC'
    )->fetchAll();

    $salePrices = db($config)->query(
        'SELECT id, tour_id, label, adult_profit, child_profit, sort_order
         FROM sale_prices
         ORDER BY sort_order ASC, id ASC'
    )->fetchAll();

    $filesByTour = [];
    foreach ($files as $file) {
        $filesByTour[(int) $file['tour_id']][] = normalize_file($config, $file);
    }

    $salePricesByTour = [];
    foreach ($salePrices as $salePrice) {
        $salePricesByTour[(int) $salePrice['tour_id']][] = normalize_sale_price($salePrice);
    }

    $data = [];
    foreach ($tours as $tour) {
        $tourId = (int) $tour['id'];
        $data[] = normalize_tour(
            $tour,
            $filesByTour[$tourId] ?? [],
            $salePricesByTour[$tourId] ?? []
        );
    }

    json_response(['data' => $data]);
}

function admin_login(array $config): void
{
    $payload = json_decode(file_get_contents('php://input'), true) ?: [];
    $password = (string) ($payload['password'] ?? '');

    if ($password === '' || !hash_equals((string) $config['admin_password'], $password)) {
        json_response(['error' => 'Incorrect password.'], 401);
        return;
    }

    session_regenerate_id(true);
    $_SESSION['admin'] = true;
    json_response(['ok' => true]);
}

function create_tour(array $config): void
{
    $title = clean_text($_POST['title'] ?? '');
    $province = clean_text($_POST['province'] ?? '');

    if ($title === '' || $province === '') {
        json_response(['error' => 'Please enter the tour name and province.'], 422);
        return;
    }

    $uploads = [];
    foreach (variant_definitions() as $variant) {
        if (has_upload($variant['field'])) {
            $uploads[] = [
                ...$variant,
                'file' => save_upload($config, $_FILES[$variant['field']]),
            ];
        }
    }

    if (count($uploads) === 0) {
        json_response(['error' => 'Please select at least one brochure file.'], 422);
        return;
    }

    $pdo = db($config);
    $pdo->beginTransaction();

    try {
        $statement = $pdo->prepare(
            'INSERT INTO tours
                (title, province, adult_price, child_price, park_included,
                 thai_adult_park_fee, thai_child_park_fee,
                 foreigner_adult_park_fee, foreigner_child_park_fee, note)
             VALUES
                (:title, :province, :adult_price, :child_price, :park_included,
                 :thai_adult_park_fee, :thai_child_park_fee,
                 :foreigner_adult_park_fee, :foreigner_child_park_fee, :note)'
        );

        $statement->execute([
            ':title' => $title,
            ':province' => $province,
            ':adult_price' => money_input($_POST['adult_price'] ?? 0),
            ':child_price' => money_input($_POST['child_price'] ?? 0),
            ':park_included' => (int) (($_POST['park_included'] ?? '0') === '1'),
            ':thai_adult_park_fee' => money_input($_POST['thai_adult_park_fee'] ?? 0),
            ':thai_child_park_fee' => money_input($_POST['thai_child_park_fee'] ?? 0),
            ':foreigner_adult_park_fee' => money_input($_POST['foreigner_adult_park_fee'] ?? 0),
            ':foreigner_child_park_fee' => money_input($_POST['foreigner_child_park_fee'] ?? 0),
            ':note' => clean_text($_POST['note'] ?? ''),
        ]);

        $tourId = (int) $pdo->lastInsertId();
        $fileStatement = $pdo->prepare(
            'INSERT INTO brochure_files
                (tour_id, brand, language, file_name, original_name, mime_type, file_size)
             VALUES
                (:tour_id, :brand, :language, :file_name, :original_name, :mime_type, :file_size)'
        );

        foreach ($uploads as $upload) {
            $fileStatement->execute([
                ':tour_id' => $tourId,
                ':brand' => $upload['brand'],
                ':language' => $upload['language'],
                ':file_name' => $upload['file']['file_name'],
                ':original_name' => $upload['file']['original_name'],
                ':mime_type' => $upload['file']['mime_type'],
                ':file_size' => $upload['file']['file_size'],
            ]);
        }

        $salePriceStatement = $pdo->prepare(
            'INSERT INTO sale_prices
                (tour_id, label, adult_profit, child_profit, sort_order)
             VALUES
                (:tour_id, :label, :adult_profit, :child_profit, :sort_order)'
        );

        foreach (sale_price_inputs() as $index => $salePrice) {
            $salePriceStatement->execute([
                ':tour_id' => $tourId,
                ':label' => $salePrice['label'],
                ':adult_profit' => $salePrice['adult_profit'],
                ':child_profit' => $salePrice['child_profit'],
                ':sort_order' => $index,
            ]);
        }

        $pdo->commit();
        json_response(['ok' => true, 'id' => $tourId], 201);
    } catch (Throwable $exception) {
        $pdo->rollBack();
        foreach ($uploads as $upload) {
            delete_file($config, $upload['file']['file_name']);
        }
        throw $exception;
    }
}

function update_tour(array $config, int $id): void
{
    $title = clean_text($_POST['title'] ?? '');
    $province = clean_text($_POST['province'] ?? '');

    if ($title === '' || $province === '') {
        json_response(['error' => 'Please enter the tour name and province.'], 422);
        return;
    }

    $pdo = db($config);
    $exists = $pdo->prepare('SELECT id FROM tours WHERE id = :id');
    $exists->execute([':id' => $id]);

    if (!$exists->fetch()) {
        json_response(['error' => 'The item to update was not found.'], 404);
        return;
    }

    $uploads = [];
    foreach (variant_definitions() as $variant) {
        if (has_upload($variant['field'])) {
            $uploads[] = [
                ...$variant,
                'file' => save_upload($config, $_FILES[$variant['field']]),
            ];
        }
    }

    $pdo->beginTransaction();

    try {
        $statement = $pdo->prepare(
            'UPDATE tours
             SET title = :title,
                 province = :province,
                 adult_price = :adult_price,
                 child_price = :child_price,
                 park_included = :park_included,
                 thai_adult_park_fee = :thai_adult_park_fee,
                 thai_child_park_fee = :thai_child_park_fee,
                 foreigner_adult_park_fee = :foreigner_adult_park_fee,
                 foreigner_child_park_fee = :foreigner_child_park_fee,
                 note = :note
             WHERE id = :id'
        );

        $statement->execute([
            ':id' => $id,
            ':title' => $title,
            ':province' => $province,
            ':adult_price' => money_input($_POST['adult_price'] ?? 0),
            ':child_price' => money_input($_POST['child_price'] ?? 0),
            ':park_included' => (int) (($_POST['park_included'] ?? '0') === '1'),
            ':thai_adult_park_fee' => money_input($_POST['thai_adult_park_fee'] ?? 0),
            ':thai_child_park_fee' => money_input($_POST['thai_child_park_fee'] ?? 0),
            ':foreigner_adult_park_fee' => money_input($_POST['foreigner_adult_park_fee'] ?? 0),
            ':foreigner_child_park_fee' => money_input($_POST['foreigner_child_park_fee'] ?? 0),
            ':note' => clean_text($_POST['note'] ?? ''),
        ]);

        $deleteSalePrices = $pdo->prepare('DELETE FROM sale_prices WHERE tour_id = :tour_id');
        $deleteSalePrices->execute([':tour_id' => $id]);

        $salePriceStatement = $pdo->prepare(
            'INSERT INTO sale_prices
                (tour_id, label, adult_profit, child_profit, sort_order)
             VALUES
                (:tour_id, :label, :adult_profit, :child_profit, :sort_order)'
        );

        foreach (sale_price_inputs() as $index => $salePrice) {
            $salePriceStatement->execute([
                ':tour_id' => $id,
                ':label' => $salePrice['label'],
                ':adult_profit' => $salePrice['adult_profit'],
                ':child_profit' => $salePrice['child_profit'],
                ':sort_order' => $index,
            ]);
        }

        foreach ($uploads as $upload) {
            replace_variant_file($config, $pdo, $id, $upload);
        }

        $pdo->commit();
        json_response(['ok' => true, 'id' => $id]);
    } catch (Throwable $exception) {
        $pdo->rollBack();
        foreach ($uploads as $upload) {
            delete_file($config, $upload['file']['file_name']);
        }
        throw $exception;
    }
}

function delete_tour(array $config, int $id): void
{
    $select = db($config)->prepare('SELECT file_name FROM brochure_files WHERE tour_id = :id');
    $select->execute([':id' => $id]);
    $files = $select->fetchAll();

    $delete = db($config)->prepare('DELETE FROM tours WHERE id = :id');
    $delete->execute([':id' => $id]);

    if ($delete->rowCount() === 0) {
        json_response(['error' => 'The item to delete was not found.'], 404);
        return;
    }

    foreach ($files as $file) {
        delete_file($config, $file['file_name']);
    }

    json_response(['ok' => true]);
}

function has_upload(string $field): bool
{
    return isset($_FILES[$field]) && ($_FILES[$field]['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
}

function replace_variant_file(array $config, PDO $pdo, int $tourId, array $upload): void
{
    $select = $pdo->prepare(
        'SELECT id, file_name
         FROM brochure_files
         WHERE tour_id = :tour_id AND brand = :brand AND language = :language'
    );
    $select->execute([
        ':tour_id' => $tourId,
        ':brand' => $upload['brand'],
        ':language' => $upload['language'],
    ]);
    $existing = $select->fetch();

    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE brochure_files
             SET file_name = :file_name,
                 original_name = :original_name,
                 mime_type = :mime_type,
                 file_size = :file_size
             WHERE id = :id'
        );
        $update->execute([
            ':id' => $existing['id'],
            ':file_name' => $upload['file']['file_name'],
            ':original_name' => $upload['file']['original_name'],
            ':mime_type' => $upload['file']['mime_type'],
            ':file_size' => $upload['file']['file_size'],
        ]);
        delete_file($config, $existing['file_name']);
        return;
    }

    $insert = $pdo->prepare(
        'INSERT INTO brochure_files
            (tour_id, brand, language, file_name, original_name, mime_type, file_size)
         VALUES
            (:tour_id, :brand, :language, :file_name, :original_name, :mime_type, :file_size)'
    );
    $insert->execute([
        ':tour_id' => $tourId,
        ':brand' => $upload['brand'],
        ':language' => $upload['language'],
        ':file_name' => $upload['file']['file_name'],
        ':original_name' => $upload['file']['original_name'],
        ':mime_type' => $upload['file']['mime_type'],
        ':file_size' => $upload['file']['file_size'],
    ]);
}

function sale_price_inputs(): array
{
    $labels = array_values((array) ($_POST['sale_label'] ?? []));
    $adultProfits = array_values((array) ($_POST['sale_adult_profit'] ?? []));
    $childProfits = array_values((array) ($_POST['sale_child_profit'] ?? []));
    $rows = [];
    $count = max(count($labels), count($adultProfits), count($childProfits));

    for ($index = 0; $index < $count; $index++) {
        $label = clean_text($labels[$index] ?? '');
        $adultProfit = money_input($adultProfits[$index] ?? 0);
        $childProfit = money_input($childProfits[$index] ?? 0);

        if ($label === '' && $adultProfit <= 0 && $childProfit <= 0) {
            continue;
        }

        $rows[] = [
            'label' => $label !== '' ? $label : 'Sale channel',
            'adult_profit' => $adultProfit,
            'child_profit' => $childProfit,
        ];
    }

    return $rows;
}

function save_upload(array $config, array $upload): array
{
    if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_response(['error' => 'File upload failed.'], 422);
        exit;
    }

    if (($upload['size'] ?? 0) > $config['max_upload_bytes']) {
        json_response(['error' => 'The file is too large.'], 422);
        exit;
    }

    $tmpName = (string) $upload['tmp_name'];
    $mimeType = mime_content_type($tmpName) ?: 'application/octet-stream';
    $allowed = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'application/pdf' => 'pdf',
    ];

    if (!isset($allowed[$mimeType])) {
        json_response(['error' => 'Only JPG, PNG, WEBP, or PDF files are supported.'], 422);
        exit;
    }

    $fileName = date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $allowed[$mimeType];
    $target = $config['upload_dir'] . '/' . $fileName;

    if (!move_uploaded_file($tmpName, $target)) {
        json_response(['error' => 'Could not move the uploaded file.'], 500);
        exit;
    }

    return [
        'file_name' => $fileName,
        'original_name' => basename((string) $upload['name']),
        'mime_type' => $mimeType,
        'file_size' => (int) $upload['size'],
    ];
}

function normalize_tour(array $row, array $files, array $salePrices): array
{
    return [
        'id' => (int) $row['id'],
        'title' => $row['title'],
        'province' => $row['province'],
        'adult_price' => (float) $row['adult_price'],
        'child_price' => (float) $row['child_price'],
        'park_included' => (bool) $row['park_included'],
        'thai_adult_park_fee' => (float) $row['thai_adult_park_fee'],
        'thai_child_park_fee' => (float) $row['thai_child_park_fee'],
        'foreigner_adult_park_fee' => (float) $row['foreigner_adult_park_fee'],
        'foreigner_child_park_fee' => (float) $row['foreigner_child_park_fee'],
        'note' => $row['note'],
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
        'files' => $files,
        'sale_prices' => $salePrices,
    ];
}

function normalize_sale_price(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'tour_id' => (int) $row['tour_id'],
        'label' => $row['label'],
        'adult_profit' => (float) $row['adult_profit'],
        'child_profit' => (float) $row['child_profit'],
        'sort_order' => (int) $row['sort_order'],
    ];
}

function normalize_file(array $config, array $row): array
{
    return [
        'id' => (int) $row['id'],
        'tour_id' => (int) $row['tour_id'],
        'brand' => $row['brand'],
        'language' => $row['language'],
        'file_name' => $row['file_name'],
        'original_name' => $row['original_name'],
        'mime_type' => $row['mime_type'],
        'file_size' => (int) $row['file_size'],
        'created_at' => $row['created_at'],
        'file_url' => rtrim($config['upload_url'], '/') . '/' . rawurlencode($row['file_name']),
    ];
}

function require_admin(): void
{
    if (empty($_SESSION['admin'])) {
        json_response(['error' => 'Please sign in as admin.'], 401);
        exit;
    }
}

function ensure_upload_dir(string $dir): void
{
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
}

function delete_file(array $config, string $fileName): void
{
    $path = $config['upload_dir'] . '/' . $fileName;
    if (is_file($path)) {
        unlink($path);
    }
}

function clean_text(mixed $value): string
{
    return trim((string) $value);
}

function money_input(mixed $value): float
{
    return max(0, (float) $value);
}

function json_response(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
