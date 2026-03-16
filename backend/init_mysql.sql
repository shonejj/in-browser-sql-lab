-- Sample MySQL data for DuckDB Lab testing
USE sampledb;

CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    city VARCHAR(50),
    country VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    product VARCHAR(100),
    amount DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'pending',
    order_date DATE,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    price DECIMAL(10,2),
    stock INT DEFAULT 0
);

-- Seed data
INSERT INTO customers (name, email, city, country) VALUES
('Alice Johnson', 'alice@example.com', 'New York', 'USA'),
('Bob Smith', 'bob@example.com', 'London', 'UK'),
('Charlie Brown', 'charlie@example.com', 'Paris', 'France'),
('Diana Prince', 'diana@example.com', 'Berlin', 'Germany'),
('Eve Wilson', 'eve@example.com', 'Tokyo', 'Japan'),
('Frank Miller', 'frank@example.com', 'Sydney', 'Australia'),
('Grace Lee', 'grace@example.com', 'Toronto', 'Canada'),
('Henry Davis', 'henry@example.com', 'Mumbai', 'India'),
('Ivy Chen', 'ivy@example.com', 'Singapore', 'Singapore'),
('Jack Taylor', 'jack@example.com', 'Amsterdam', 'Netherlands');

INSERT INTO products (name, category, price, stock) VALUES
('Laptop Pro', 'Electronics', 1299.99, 50),
('Wireless Mouse', 'Electronics', 29.99, 200),
('Standing Desk', 'Furniture', 549.00, 30),
('Monitor 27"', 'Electronics', 399.99, 75),
('Keyboard Mech', 'Electronics', 89.99, 150),
('Office Chair', 'Furniture', 299.00, 40),
('USB Hub', 'Electronics', 39.99, 300),
('Desk Lamp', 'Furniture', 49.99, 100),
('Webcam HD', 'Electronics', 79.99, 120),
('Cable Organizer', 'Accessories', 14.99, 500);

INSERT INTO orders (customer_id, product, amount, status, order_date) VALUES
(1, 'Laptop Pro', 1299.99, 'completed', '2024-01-15'),
(2, 'Wireless Mouse', 29.99, 'completed', '2024-01-20'),
(3, 'Standing Desk', 549.00, 'shipped', '2024-02-01'),
(1, 'Monitor 27"', 399.99, 'completed', '2024-02-10'),
(4, 'Keyboard Mech', 89.99, 'pending', '2024-02-15'),
(5, 'Office Chair', 299.00, 'shipped', '2024-03-01'),
(2, 'USB Hub', 39.99, 'completed', '2024-03-05'),
(6, 'Desk Lamp', 49.99, 'completed', '2024-03-10'),
(7, 'Webcam HD', 79.99, 'pending', '2024-03-15'),
(3, 'Laptop Pro', 1299.99, 'shipped', '2024-03-20'),
(8, 'Cable Organizer', 14.99, 'completed', '2024-03-25'),
(9, 'Monitor 27"', 399.99, 'pending', '2024-04-01'),
(10, 'Wireless Mouse', 29.99, 'completed', '2024-04-05'),
(1, 'Keyboard Mech', 89.99, 'shipped', '2024-04-10'),
(5, 'Standing Desk', 549.00, 'completed', '2024-04-15');
