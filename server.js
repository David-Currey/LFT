require('dotenv').config()
const express = require('express')
const axios = require('axios')
const session = require('express-session')
const crypto = require('crypto')
const path = require('path')

const app = express()
const PORT = 3000

// Blizzard OAuth credentials from .env
const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET
const REDIRECT_URI = 'http://localhost:3000/callback'

// Serve static files (index.html, app.js, style.css) from "public" or current directory
app.use(express.static(path.join(__dirname, 'public')))

// Session middleware for OAuth
app.use(
	session({
		secret: 'supersecret',
		resave: false,
		saveUninitialized: true,
	})
)

// AUTH ROUTES

// Redirect users to Blizzard login
app.get('/auth/login', (req, res) => {
	const state = crypto.randomBytes(16).toString('hex') // random state
	req.session.oauthState = state

	const authUrl = `https://oauth.battle.net/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=openid wow.profile&state=${state}`
	res.redirect(authUrl)
})

// Callback from Blizzard after user logs in
app.get('/callback', async (req, res) => {
	const { code, state } = req.query

	// Validate state parameter
	if (!code || !state || state !== req.session.oauthState) {
		return res.status(400).send('Invalid state parameter')
	}

	try {
		// Exchange code for an access token
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

		// Store token in session
		req.session.access_token = tokenResponse.data.access_token

		// Redirect to the frontend #login page
		res.redirect('/#login')
	} catch (error) {
		console.error(error.response ? error.response.data : error.message)
		res.status(500).send('Authentication failed')
	}
})

// PROFILE ROUTE (Fetch user + character data)
app.get('/api/profile', async (req, res) => {
	if (!req.session.access_token) {
		return res.status(401).send('Unauthorized')
	}

	try {
		// Fetch the user’s WoW profile
		const profileResponse = await axios.get(
			'https://us.api.blizzard.com/profile/user/wow',
			{
				headers: { Authorization: `Bearer ${req.session.access_token}` },
				params: { namespace: 'profile-us', locale: 'en_US' },
			}
		)

		const profileData = profileResponse.data
		const wowAccounts = profileData.wow_accounts || []

		// If user has no WoW accounts, return what we have
		if (!wowAccounts.length) {
			return res.json(profileData)
		}

		// Enhance each WoW account’s characters with media + mythic+ data
		const enhancedWowAccounts = await Promise.all(
			wowAccounts.map(async (account) => {
				if (!account.characters || !account.characters.length) {
					return account
				}

				const enhancedCharacters = await Promise.all(
					account.characters.map(async (char) => {
						// Convert name to lowercase + encode for URL
						const realmSlug = char.realm.slug
						const characterName = encodeURIComponent(char.name.toLowerCase())

						// Fetch Character Media
						try {
							const mediaResponse = await axios.get(
								`https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}/character-media`,
								{
									headers: {
										Authorization: `Bearer ${req.session.access_token}`,
									},
									params: {
										namespace: 'profile-us',
										locale: 'en_US',
									},
								}
							)
							const assets = mediaResponse.data.assets || []
							const avatarAsset = assets.find((asset) => asset.key === 'avatar')

							char.media = {
								avatar_url: avatarAsset ? avatarAsset.value : '',
							}
						} catch (error) {
							console.error(
								`Failed to fetch media for ${char.name}:`,
								error.response ? error.response.data : error.message
							)
							char.media = { avatar_url: '' }
						}

						// Fetch Mythic+ Score
						try {
							const mythicResponse = await axios.get(
								`https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}/mythic-keystone-profile`,
								{
									headers: {
										Authorization: `Bearer ${req.session.access_token}`,
									},
									params: {
										namespace: 'profile-us',
										locale: 'en_US',
									},
								}
							)

							const rating = mythicResponse.data.current_mythic_rating
								? mythicResponse.data.current_mythic_rating.rating
								: 'N/A'

							char.mythic_plus_score = rating
						} catch (error) {
							console.error(
								`Failed to fetch mythic+ for ${char.name}:`,
								error.response ? error.response.data : error.message
							)
							char.mythic_plus_score = 'N/A'
						}

						return char
					})
				)

				// Assign the enhanced characters back
				account.characters = enhancedCharacters
				return account
			})
		)

		// Update the wow_accounts with enhanced data
		profileData.wow_accounts = enhancedWowAccounts

		// Return final profile data (with media + mythic+ info)
		res.json(profileData)
	} catch (error) {
		console.error(error.response ? error.response.data : error.message)
		res.status(500).send('Failed to fetch profile')
	}
})

// LOGOUT ROUTE
app.get('/auth/logout', (req, res) => {
	req.session.destroy(() => {
		res.redirect('/')
	})
})

// START SERVER
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`)
})
