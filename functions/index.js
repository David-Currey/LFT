/*
using:
---------
express
firebase cloud functions v2
secure blizzard authorization 
defineSecrect
HttpOnly cookie
*/

// Google Cloud Function-based Express server for Blizzard OAuth
const express = require('express')
const axios = require('axios')
const crypto = require('crypto')
const cookieParser = require('cookie-parser')
const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()

const BLIZZARD_CLIENT_ID = defineSecret('BLIZZARD_CLIENT_ID')
const BLIZZARD_CLIENT_SECRET = defineSecret('BLIZZARD_CLIENT_SECRET')
const REDIRECT_URI = 'https://blizz-webapp-d0bf2.web.app/callback'

const app = express()
app.use(express.json())
app.use(cookieParser())

// BLIZZARD LOGIN REDIRECT
app.get('/auth/login', (req, res) => {
	const state = crypto.randomBytes(16).toString('hex')
	const authUrl = new URL('https://oauth.battle.net/authorize')
	authUrl.searchParams.set('client_id', BLIZZARD_CLIENT_ID.value())
	authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
	authUrl.searchParams.set('response_type', 'code')
	authUrl.searchParams.set('scope', 'openid wow.profile')
	authUrl.searchParams.set('state', state)
	res.redirect(authUrl.toString())
})

// BLIZZARD CALLBACK (fetches userinfo)
app.get('/callback', async (req, res) => {
	const { code, state } = req.query
	if (!code || !state) {
		return res.status(400).send('Invalid state parameter')
	}

	try {
		const tokenResponse = await axios.post(
			'https://oauth.battle.net/token',
			new URLSearchParams({
				client_id: BLIZZARD_CLIENT_ID.value(),
				client_secret: BLIZZARD_CLIENT_SECRET.value(),
				code,
				grant_type: 'authorization_code',
				redirect_uri: REDIRECT_URI,
			}),
			{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
		)

		const access_token = tokenResponse.data.access_token

		const userInfo = await axios.get(
			'https://oauth.battle.net/oauth/userinfo',
			{
				headers: { Authorization: `Bearer ${access_token}` },
			}
		)

		console.log('Blizzard User:', userInfo.data)

		res.cookie('blizz_token', access_token, {
			httpOnly: true,
			secure: true,
			sameSite: 'None',
			maxAge: 60 * 60 * 1000,
		})

		res.redirect('/#login')
	} catch (error) {
		console.error('AUTH ERROR:', error.response?.data || error.message)
		res.status(500).send('Authentication failed')
	}
})

// PROFILE FETCH ROUTE
app.get('/api/profile', async (req, res) => {
	const access_token = req.cookies.blizz_token
	if (!access_token) return res.status(401).send('Unauthorized')

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

		if (!wowAccounts.length) {
			return res.json(profileData)
		}

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
				if (!account.characters || !account.characters.length) {
					return account
				}

				account.characters = account.characters.filter(
					(char) => char.level === MAX_LEVEL
				)

				const enhancedCharacters = await Promise.all(
					account.characters.map(async (char) => {
						const realmSlug = char.realm.slug
						const characterName = encodeURIComponent(char.name.toLowerCase())

						// Fetch Character Media
						try {
							const mediaRes = await axios.get(
								`https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}/character-media`,
								{
									headers: { Authorization: `Bearer ${access_token}` },
									params: { namespace: 'profile-us', locale: 'en_US' },
								}
							)
							const assets = mediaRes.data.assets || []
							const avatarAsset =
								assets.find((a) => a.key === 'avatar') ||
								assets.find((a) => a.key === 'render') ||
								assets.find((a) => a.key === 'main') ||
								assets[0]
							char.media = { avatar_url: avatarAsset ? avatarAsset.value : '' }
						} catch (e) {
							char.media = { avatar_url: '' }
						}

						// Fetch Mythic+ Score
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

						// Fetch Summary Info
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

// LOGOUT
app.get('/auth/logout', (req, res) => {
	res.clearCookie('blizz_token')
	res.redirect('/')
})

// CREATE GROUP
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

exports.app = onRequest(
	{ secrets: [BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET] },
	app
)
