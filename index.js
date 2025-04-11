const express = require('express')
const { Pool } = require('pg')
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 3000

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: false,
    },
})

app.use(cors())
// app.use(cors({
//     origin: process.env.DB_HOST,
//     methods: ['GET', 'POST', 'PUT', 'DELETE'],
//     allowedHeaders: ['Content-Type', 'Authorization'],
// }))

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
            expiresIn: '100h', // Токен действителен 100 часов Поставить нееделю
        })

        // Отправляем токен клиенту
        res.json({ token })
    } catch (err) {
        console.error('Ошибка при авторизации/регистрации:', err)
        res.status(500).json({ message: 'Server error' })
    }
})

const authenticateToken = (req, res, next) => {
    // Получаем токен из заголовка Authorization
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1] // Формат: "Bearer <token>"

    if (!token) {
        return res.status(401).json({ message: 'Token is required' })
    }

    // Проверяем токен
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token' })
        }
        // Если токен валиден, добавляем данные пользователя в запрос
        req.user = user
        next() // Передаем управление следующему middleware или маршруту
    })
}

app.get('/scores', authenticateToken, async (req, res) => {
    try {
        const { game } = req.query // Получаем параметр game из query string

        let query = 'SELECT * FROM scores'
        let params = []

        // Если указана конкретная игра, добавляем условие WHERE
        if (game) {
            query += ' WHERE game_name = $1'
            params.push(game)
        }

        const { rows } = await pool.query(query, params)

        // Если запрашивалась конкретная игра, возвращаем плоский массив результатов
        if (game) {
            return res.json(rows.map(row => ({
                agent: row.agent,
                time: row.time,
                mistakes: row.mistakes,
                wordSet: row.wordset,
            })))
        }

        // Иначе возвращаем сгруппированные результаты по всем играм (как было)
        const scoresByGame = {}
        rows.forEach(row => {
            if (!scoresByGame[row.game_name]) {
                scoresByGame[row.game_name] = []
            }
            scoresByGame[row.game_name].push({
                agent: row.agent,
                time: row.time,
                mistakes: row.mistakes,
                wordSet: row.wordset,
            })
        })

        res.json(scoresByGame)
    } catch (err) {
        console.error(err)
        res.status(500).send('Server error')
    }
})

app.post('/scores', authenticateToken, async (req, res) => {
    const { game, time, mistakes, agent, wordSet } = req.body
    // const agent = req.user.username

    // if (!game || !time || !mistakes || !agent) {
    if ((game ?? time ?? mistakes ?? agent ?? wordSet) === undefined) {
        return res.status(400).json({ message: 'Game, time, mistakes and agent are required' })
    }

    try {
        // Проверяем, есть ли уже результат у пользователя для этой игры
        const existingResult = await pool.query(
            'SELECT * FROM scores WHERE game_name = $1 AND agent = $2 AND wordSet = $3',
            [game, agent, wordSet]
        )

        if (existingResult.rows.length > 0) {
            const currentRecord = existingResult.rows[0]

            // Если новый результат лучше
            if (time < currentRecord.time) {
                // Обновляем запись
                await pool.query(
                    'UPDATE scores SET time = $1, mistakes = $2 WHERE id = $3',
                    [time, mistakes, currentRecord.id]
                )
                res.json({ message: 'Рекорд обновлен', record: { agent, time, mistakes } })
            } else {
                // Если результат хуже
                res.json({ message: 'Рекорд не побит', record: currentRecord })
            }
        } else {
            // Если результата нет, создаем новую запись
            await pool.query(
                'INSERT INTO scores (game_name, agent, time, mistakes, wordSet) VALUES ($1, $2, $3, $4, $5)',
                [game, agent, time, mistakes, wordSet]
            )
            res.json({ message: 'Рекорд добавлен', record: { agent, time, mistakes } })
        }
    } catch (err) {
        console.error(err)
        res.status(500).send('Server error')
    }
})

app.get('/test', async (req, res) => {
    res.send('Test!')
    // const users = await pool.query('SELECT * FROM users')
    // res.send(users.rows)
})

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`)
})