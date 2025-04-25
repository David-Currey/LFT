/**
 * Express app for handling Battle.net OAuth login and character profile fetch.
 *
 * This server-side code:
 * - Redirects users to Battle.net OAuth login
 * - Handles the callback to exchange the code for an access token
 * - Issues a signed JWT containing user info and access token
 * - Provides a protected `/api/profile` endpoint to fetch WoW character data
 *
 * Deployed as a Firebase Gen 2 HTTPS function.
 */
const functions = require('firebase-functions/v2')
const express = require('express')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const { defineSecret } = require('firebase-functions/params')
const fetch = (...args) =>
	import('node-fetch').then(({ default: fetch }) => fetch(...args))

// retrieve environment secrets from Firebase
const BLIZZARD_CLIENT_ID = defineSecret('BLIZZARD_CLIENT_ID')
const BLIZZARD_CLIENT_SECRET = defineSecret('BLIZZARD_CLIENT_SECRET')
const JWT_SECRET = defineSecret('JWT_SECRET')

const REDIRECT_URI = 'https://blizz-webapp-d0bf2.web.app/callback'

function createApp({ clientID, clientSecret, jwtSecret }) {
	const app = express()
	app.use(cors({ origin: true, credentials: true }))
	app.use(express.json())

	// --- AUTHENTICATION ROUTE ---
	// Redirects the user to Blizzard's OAuth2 login page
	// Includes the client ID, requested scopes, and redirect URI in the query params
	app.get('/auth/login', (req, res) => {
		const state = Math.random().toString(36).substring(2)

		// Set up the query parameters for Blizzard's authorization endpoint
		const params = new URLSearchParams({
			client_id: clientID,
			redirect_uri: REDIRECT_URI,
			response_type: 'code',
			scope: 'openid wow.profile',
			state,
		})

		// Redirect the user to Blizzard's OAuth2 login screen
		res.redirect(`https://oauth.battle.net/authorize?${params.toString()}`)
	})

	// --- CALLBACK ROUTE ---
	// Handles the redirect from Battle.net OAuth and exchanges the code for an access token
	// Then signs a JWT with user info and redirects the user back to the frontend with the token
	app.get('/callback', async (req, res) => {
		const { code } = req.query
		if (!code) return res.status(400).send('Missing code')

		try {
			// Exchange the authorization code for an access token
			const tokenRes = await fetch('https://oauth.battle.net/token', {
				method: 'POST',
				headers: {
					Authorization:
						'Basic ' +
						Buffer.from(`${clientID}:${clientSecret}`).toString('base64'),
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					grant_type: 'authorization_code',
					code,
					redirect_uri: REDIRECT_URI,
				}),
			})

			if (!tokenRes.ok) {
				const errorText = await tokenRes.text()
				throw new Error(`Token exchange failed: ${errorText}`)
			}

			const tokenData = await tokenRes.json()
			const accessToken = tokenData.access_token

			// Use the access token to get the user's Battle.net profile info
			const userInfoRes = await fetch('https://us.battle.net/oauth/userinfo', {
				headers: { Authorization: `Bearer ${accessToken}` },
			})

			if (!userInfoRes.ok) throw new Error('Failed to fetch user info')
			const userInfo = await userInfoRes.json()

			// Create a signed JWT containing the user's battletag and access token
			const jwtToken = jwt.sign(
				{ battletag: userInfo.battletag, accessToken },
				jwtSecret,
				{ expiresIn: '24h' }
			)

			// Redirect back to frontend with the token in the URL hash
			// The frontend will detect it and store it in localStorage
			res.redirect(`/#token=${jwtToken}`)
		} catch (err) {
			console.error('Callback error:', err)
			res.status(500).send('OAuth callback failed')
		}
	})

	// --- PROFILE ROUTE ---
	// Authenticated endpoint that verifies the JWT and uses the user's access token
	// to fetch their World of Warcraft characters, along with class info, avatar, and mythic+ rating
	app.get('/api/profile', async (req, res) => {
		const authHeader = req.headers.authorization
		if (!authHeader?.startsWith('Bearer '))
			return res.status(401).send('Missing token')

		try {
			// Decode and verify the JWT from Authorization header
			const token = authHeader.split(' ')[1]
			const payload = jwt.verify(token, jwtSecret)
			const { accessToken, battletag } = payload

			// Fetch user's WoW account data from Blizzard's profile API
			const profileRes = await fetch(
				'https://us.api.blizzard.com/profile/user/wow?namespace=profile-us&locale=en_US',
				{ headers: { Authorization: `Bearer ${accessToken}` } }
			)

			if (!profileRes.ok) {
				const errorText = await profileRes.text()
				throw new Error(`Blizzard profile fetch failed: ${errorText}`)
			}

			const profileData = await profileRes.json()
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
					// Skip empty accounts
					if (!account.characters?.length) return account

					// Filter characters to only include max level (80)
					account.characters = account.characters.filter(
						(char) => char.level === MAX_LEVEL
					)

					const enhancedCharacters = await Promise.all(
						// Fetch media (avatar), mythic+ score, and class summary for each character
						account.characters.map(async (char) => {
							const realmSlug = char.realm.slug
							const characterName = encodeURIComponent(char.name.toLowerCase())

							const media = await fetch(
								`https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}/character-media?namespace=profile-us&locale=en_US`,
								{ headers: { Authorization: `Bearer ${accessToken}` } }
							).then((r) => (r.ok ? r.json() : null))

							// Fetch character avatar/media
							const avatar =
								media?.assets?.find((a) => a.key === 'avatar') ||
								media?.assets?.find((a) => a.key === 'render') ||
								media?.assets?.[0]

							char.media = { avatar_url: avatar?.value || '' }

							// Fetch Mythic+ rating
							const mythic = await fetch(
								`https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}/mythic-keystone-profile?namespace=profile-us&locale=en_US`,
								{ headers: { Authorization: `Bearer ${accessToken}` } }
							).then((r) => (r.ok ? r.json() : null))

							char.mythic_plus_score =
								mythic?.current_mythic_rating?.rating || 'N/A'

							// Fetch character summary info (class name, item level, etc.)
							const summary = await fetch(
								`https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}?namespace=profile-us&locale=en_US`,
								{ headers: { Authorization: `Bearer ${accessToken}` } }
							).then((r) => (r.ok ? r.json() : null))

							char.class = summary?.character_class?.name || 'Unknown'
							char.itemLevel = summary?.equipped_item_level || 'N/A'
							char.classColor = classColors[char.class] || '#FFFFFF'

							return char
						})
					)

					account.characters = enhancedCharacters
					return account
				})
			)

			// Return enhanced profile data to the frontend
			res.json({ battletag, wow_accounts: enhancedWowAccounts })
		} catch (err) {
			console.error('Profile fetch error:', err)
			res.status(401).send('Invalid or expired token')
		}
	})

	return app
}

// Export the Express app as a Firebase HTTPS function (Gen 2)
exports.app = functions.https.onRequest(
	{
		secrets: ['BLIZZARD_CLIENT_ID', 'BLIZZARD_CLIENT_SECRET', 'JWT_SECRET'],
		region: 'us-central1',
	},
	(req, res) => {
		const app = createApp({
			clientID: BLIZZARD_CLIENT_ID.value(),
			clientSecret: BLIZZARD_CLIENT_SECRET.value(),
			jwtSecret: JWT_SECRET.value(),
		})
		return app(req, res)
	}
)
