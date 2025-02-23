require('dotenv').config()
const express = require('express')
const axios = require('axios')
const session = require('express-session')
const crypto = require('crypto')
const path = require('path')

const app = express()
const PORT = 3000

const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET
const REDIRECT_URI = 'http://localhost:3000/callback'

app.use(express.static(path.join(__dirname, 'public')))

app.use(
	session({
		secret: 'supersecret',
		resave: false,
		saveUninitialized: true,
	})
)

// Redirect users to Blizzard login with a state parameter
app.get('/auth/login', (req, res) => {
	const state = crypto.randomBytes(16).toString('hex') // Generate random state
	req.session.oauthState = state // Store state in session

	const authUrl = `https://oauth.battle.net/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=openid wow.profile&state=${state}`
	res.redirect(authUrl)
})

app.get('/callback', async (req, res) => {
	const { code, state } = req.query

	// Validate state parameter
	if (!code || !state || state !== req.session.oauthState) {
		return res.status(400).send('Invalid state parameter')
	}

	try {
		const tokenResponse = await axios.post(
			'https://oauth.battle.net/token',
			new URLSearchParams({
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				code,
				grant_type: 'authorization_code',
				redirect_uri: REDIRECT_URI,
			}),
			{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
		)

		req.session.access_token = tokenResponse.data.access_token

		// Redirect to the login page after authentication
		res.redirect('/#login')
	} catch (error) {
		console.error(error.response ? error.response.data : error.message)
		res.status(500).send('Authentication failed')
	}
})

// Fetch character profile
app.get('/api/profile', async (req, res) => {
	if (!req.session.access_token) return res.status(401).send('Unauthorized')

	try {
		const profileResponse = await axios.get(
			'https://us.api.blizzard.com/profile/user/wow',
			{
				headers: { Authorization: `Bearer ${req.session.access_token}` },
				params: { namespace: 'profile-us', locale: 'en_US' },
			}
		)

		res.json(profileResponse.data)
	} catch (error) {
		console.error(error.response ? error.response.data : error.message)
		res.status(500).send('Failed to fetch profile')
	}
})

// Logout route
app.get('/auth/logout', (req, res) => {
	req.session.destroy(() => {
		res.redirect('/')
	})
})

app.listen(PORT, () =>
	console.log(`Server running on http://localhost:${PORT}`)
)
