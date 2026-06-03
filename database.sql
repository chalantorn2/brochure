CREATE TABLE IF NOT EXISTS tours (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    province VARCHAR(120) NOT NULL,
    adult_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    child_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    park_included TINYINT(1) NOT NULL DEFAULT 0,
    thai_adult_park_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    thai_child_park_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    foreigner_adult_park_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    foreigner_child_park_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    note TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_province (province),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS brochure_files (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tour_id INT UNSIGNED NOT NULL,
    brand ENUM('seven_smile', 'indo_smile', 'no_logo') NOT NULL,
    language ENUM('th', 'en') NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY unique_tour_variant (tour_id, brand, language),
    INDEX idx_brand_language (brand, language),
    CONSTRAINT fk_brochure_files_tour
        FOREIGN KEY (tour_id) REFERENCES tours (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_prices (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tour_id INT UNSIGNED NOT NULL,
    label VARCHAR(160) NOT NULL,
    adult_profit DECIMAL(10,2) NOT NULL DEFAULT 0,
    child_profit DECIMAL(10,2) NOT NULL DEFAULT 0,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_tour_sort (tour_id, sort_order),
    CONSTRAINT fk_sale_prices_tour
        FOREIGN KEY (tour_id) REFERENCES tours (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
