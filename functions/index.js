const functions = require('firebase-functions')
const express = require('express')
const axios = require('axios')
const crypto = require('crypto')
const admin = require('firebase-admin')

const app = express()

admin.initializeApp()
const db = admin.firestore()

app.use(express.json())

// Blizzard OAuth credentials from environment config
const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET
const REDIRECT_URI = 'https:// blizz-webapp-d0bf2.web.app/callback'

// Session-like storage (for dev only, not recommended for production without external session store)
const sessionStore = new Map()

// AUTH ROUTES
app.get('/auth/login', (req, res) => {
	const state = crypto.randomBytes(16).toString('hex')
	sessionStore.set(state, {})

	const authUrl = `https://oauth.battle.net/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=openid wow.profile&state=${state}`
	res.redirect(authUrl)
})

app.get('/callback', async (req, res) => {
	const { code, state } = req.query

	if (!code || !state || !sessionStore.has(state)) {
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

		const access_token = tokenResponse.data.access_token

		// Get Blizzard user info
		const userInfo = await axios.get(
			'https://oauth.battle.net/oauth/userinfo',
			{
				headers: { Authorization: `Bearer ${access_token}` },
			}
		)

		const blizzardUserId = userInfo.data.sub
		const customToken = await admin
			.auth()
			.createCustomToken(`blizz_${blizzardUserId}`)

		res.redirect(`/#/login?token=${customToken}`)
	} catch (error) {
		console.error(error.response ? error.response.data : error.message)
		res.status(500).send('Authentication failed')
	}
})

app.get('/api/profile', async (req, res) => {
	const authHeader = req.headers.authorization
	if (!authHeader) return res.status(401).send('Unauthorized')

	const access_token = authHeader.replace('Bearer ', '')

	try {
		const profileResponse = await axios.get(
			'https://us.api.blizzard.com/profile/user/wow',
			{
				headers: { Authorization: `Bearer ${access_token}` },
				params: { namespace: 'profile-us', locale: 'en_US' },
			}
		)

		const profileData = profileResponse.data
		const wowAccounts = profileData.wow_accounts || []
		const MAX_LEVEL = 80

		const classColors = {
			Warrior: '#C79C6E',
			Paladin: '#F58CBA',
			Hunter: '#ABD473',
			Rogue: '#FFF569',
			Priest: '#FFFFFF',
			'Death Knight': '#C41F3B',
			Shaman: '#0070DE',
			Mage: '#69CCF0',
			Warlock: '#9482C9',
			Monk: '#00FF96',
			Druid: '#FF7D0A',
			'Demon Hunter': '#A330C9',
		}

		const enhancedWowAccounts = await Promise.all(
			wowAccounts.map(async (account) => {
				if (!account.characters?.length) return account
				account.characters = account.characters.filter(
					(char) => char.level === MAX_LEVEL
				)

				const enhancedCharacters = await Promise.all(
					account.characters.map(async (char) => {
						const realmSlug = char.realm.slug
						const characterName = encodeURIComponent(char.name.toLowerCase())

						try {
							const mediaRes = await axios.get(
								`https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}/character-media`,
								{
									headers: { Authorization: `Bearer ${access_token}` },
									params: { namespace: 'profile-us', locale: 'en_US' },
								}
							)
							const avatar = mediaRes.data.assets.find(
								(asset) => asset.key === 'avatar'
							)?.value
							char.media = { avatar_url: avatar || '' }
						} catch (e) {
							char.media = { avatar_url: '' }
						}

						try {
							const mythicRes = await axios.get(
								`https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}/mythic-keystone-profile`,
								{
									headers: { Authorization: `Bearer ${access_token}` },
									params: { namespace: 'profile-us', locale: 'en_US' },
								}
							)
							char.mythic_plus_score =
								mythicRes.data.current_mythic_rating?.rating || 'N/A'
						} catch (e) {
							char.mythic_plus_score = 'N/A'
						}

						try {
							const summaryRes = await axios.get(
								`https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}`,
								{
									headers: { Authorization: `Bearer ${access_token}` },
									params: { namespace: 'profile-us', locale: 'en_US' },
								}
							)
							char.class = summaryRes.data.character_class?.name || 'Unknown'
							char.itemLevel = summaryRes.data.equipped_item_level || 'N/A'
						} catch (e) {
							char.class = 'Unknown'
							char.itemLevel = 'N/A'
						}

						char.classColor = classColors[char.class] || '#FFFFFF'
						return char
					})
				)

				account.characters = enhancedCharacters
				return account
			})
		)

		profileData.wow_accounts = enhancedWowAccounts
		res.json(profileData)
	} catch (error) {
		console.error(error.response?.data || error.message)
		res.status(500).send('Failed to fetch profile')
	}
})

// Create Group
app.post('/api/groups', async (req, res) => {
	const { title, description, time, leader, role, owner } = req.body
	if (!title || !time || !leader || !owner) {
		return res.status(400).json({ error: 'Missing required fields' })
	}

	try {
		const docRef = await db.collection('groups').add({
			title,
			description,
			time,
			leader,
			role,
			owner,
			createdAt: new Date().toISOString(),
		})
		res.status(201).json({ message: 'Group created', id: docRef.id })
	} catch (e) {
		console.error('Error saving group:', e)
		res.status(500).json({ error: 'Failed to create group' })
	}
})

exports.app = functions.https.onRequest(app)
