require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = 8080

app.use(express.json());

app.use(cors());

mongoose.connect('mongodb+srv://kunalmehndi:helloworld@cluster0.au5ra.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const stockSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ticker: { type: String, required: true },
    quantity: { type: Number, required: true },
    buyPrice: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

async function authenticateUser(req, res, next) {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, SECRET_KEY);
        const user = await User.findById(decoded.id);
        if (!user) {
            throw new Error();
        }
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Please authenticate.' });
    }
};

const User = mongoose.model('User', userSchema);
const Stock = mongoose.model("Stock", stockSchema);

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

const SECRET_KEY = process.env.SECRET_KEY;

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ status: 'success', token });  // Add status field here
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});


app.get('/api/stocks', authenticateUser, async (req, res) => {
    try {
        const stocks = await Stock.find({ user: req.user._id });
        res.json(stocks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stocks', authenticateUser, async (req, res) => {
    try {
        const { name, ticker, quantity, buyPrice } = req.body;
        const stock = new Stock({ name, ticker, quantity, buyPrice, user: req.user._id });
        await stock.save();
        res.status(201).json(stock);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/stocks/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const stock = await Stock.findOneAndUpdate({ _id: id, user: req.user._id }, updates, { new: true });
        if (!stock) {
            return res.status(404).json({ error: 'Stock not found' });
        }
        res.json(stock);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/stocks/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const stock = await Stock.findOneAndDelete({ _id: id, user: req.user._id });
        if (!stock) {
            return res.status(404).json({ error: 'Stock not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stocks/portfolio-value', authenticateUser, async (req, res) => {
    try {
        const stocks = await Stock.find({ user: req.user._id });
        const totalValue = stocks.reduce((sum, stock) => sum + stock.quantity * stock.buyPrice, 0);
        res.json({ totalValue });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stocks/dashboard', authenticateUser, async (req, res) => {
    try {
        const stocks = await Stock.find({ user: req.user._id });

        if (!stocks || stocks.length === 0) {
            return res.status(404).json({ error: 'No stocks found for this user.' });
        }

        const totalValue = stocks.reduce((sum, stock) => sum + (stock.quantity * stock.buyPrice), 0);

        let topPerformingStock = null;
        let maxPerformance = -Infinity;

        stocks.forEach((stock) => {
            const stockValue = stock.quantity * stock.buyPrice;
            if (stockValue > maxPerformance) {
                maxPerformance = stockValue;
                topPerformingStock = stock;
            }
        });

        const portfolioDistribution = {};
        stocks.forEach((stock) => {
            const stockValue = stock.quantity * stock.buyPrice;
            portfolioDistribution[stock.ticker] = ((stockValue / totalValue) * 100).toFixed(2);
        });

        const metrics = {
            userId: req.user._id,
            totalValue: totalValue,
            topPerformingStock: topPerformingStock,
            portfolioDistribution: portfolioDistribution,
        };

        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
