const express = require('express')
const { Pool } = require('pg')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 3000

// const pool = new Pool({
//     user: process.env.DB_USER,
//     host: process.env.DB_HOST,
//     database: process.env.DB_NAME,
//     password: process.env.DB_PASSWORD,
//     port: process.env.DB_PORT,
// })
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
})

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Ошибка подключения к PostgreSQL:', err)
    } else {
        console.log('Успешное подключение к PostgreSQL:', res.rows[0])
    }
})
// Функция для создания таблиц и вставки данных
const initializeDatabase = async () => {
    try {
        // Создание таблицы users
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Создание таблицы your_table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS your_table (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL
            );
        `);

        // Вставка тестовых данных в your_table
        await pool.query(`
            INSERT INTO your_table (name)
            VALUES ('Example 1'), ('Example 2')
            ON CONFLICT DO NOTHING;
        `);

        console.log('Таблицы успешно созданы или уже существуют.');
    } catch (err) {
        console.error('Ошибка при инициализации базы данных:', err);
    }
};

// Вызов функции при запуске сервера
initializeDatabase();

app.use(express.json())


const JWT_SECRET = process.env.JWT_SECRET

// Маршрут для авторизации/регистрации
app.post('/auth', async (req, res) => {
    const { username } = req.body

    if (!username) {
        return res.status(400).json({ message: 'Username is required' })
    }

    try {
        // Поиск пользователя в базе данных
        const userQuery = await pool.query('SELECT * FROM users WHERE username = $1', [username])
        let user = userQuery.rows[0]

        // Если пользователь не найден, создаем нового
        if (!user) {
            const newUserQuery = await pool.query(
                'INSERT INTO users (username) VALUES ($1) RETURNING *',
                [username]
            )
            user = newUserQuery.rows[0]
        }

        // Создаем JWT-токен
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
            expiresIn: '100h', // Токен действителен 100 часов
        })

        // Отправляем токен клиенту
        res.json({ token })
    } catch (err) {
        console.error('Ошибка при авторизации/регистрации:', err)
        res.status(500).json({ message: 'Server error' })
    }
});

// Защищенный маршрут (пример)
app.get('/protected', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
        return res.status(401).json({ message: 'Token is required' })
    }

    try {
        // Проверка токена
        const decoded = jwt.verify(token, JWT_SECRET)
        res.json({ message: 'Access granted', user: decoded })
    } catch (err) {
        console.error('Ошибка при проверке токена:', err)
        res.status(401).json({ message: 'Invalid token' })
    }
})

app.get('/data', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM your_table')
        res.json(rows)
    } catch (err) {
        console.error(err)
        res.status(500).send('Server error')
    }
})

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`)
})