/**
 * Frontend routing and session handling for the Blizz web app.
 *
 * This script handles:
 * - Dynamic content loading based on URL hash
 * - Parsing and storing the JWT from Battle.net OAuth login
 * - Fetching and rendering character data for logged-in users
 * - Rendering modals for creating groups and viewing profiles
 *
 * Works with the Firebase/Express backend to enable Battle.net-authenticated access.
 */

import {
	validateCreateGroupForm,
	validateApplyGroupForm,
} from './validation.js'

// Main function to determine what page to load based on URL hash
function loadContent() {
	const content = document.getElementById('content')
	const hash = window.location.hash

	// If user just logged in and redirected back with #token=xyz
	if (hash.startsWith('#token=')) {
		const token = hash.split('=')[1]
		localStorage.setItem('jwt', token)
		window.location.hash = '#login'
		return
	}

	// Route to appropriate content page
	switch (hash) {
		case '#home':
			loadHomePage(content)
			break
		case '#about':
			loadAboutPage(content)
			break
		case '#login':
			loadLoginPage(content)
			break
		default:
			loadHomePage(content)
			break
	}
}

// Load home page content, including create group button and search bar
function loadHomePage(content) {
	content.innerHTML = `
	<div id="create-search-container">
		<div id="create-group-btn-container">
			<button class="drk-btn" id="create-group-btn">Create Group</button>
		</div>
		<form id="search-form">
			<input id="search-input" type="text" placeholder="Search groups">
			<button class="drk-btn" type="submit">Search</button>
		</form>
	</div>
	<div class="content-wrapper">
		<h1>Welcome to the Home Page!</h1>
		<p>Groups will be loaded here</p>
	</div>
	`
	const groupModal = document.getElementById('group-create-modal')
	const createGroupBtn = document.getElementById('create-group-btn')
	const closeBtn = document.getElementById('close-group-create-btn')

	// When "Create Group" button is clicked, open modal and populate characters
	if (createGroupBtn && groupModal) {
		createGroupBtn.addEventListener('click', async () => {
			groupModal.style.display = 'flex'

			try {
				const res = await fetch('/api/profile', {
					headers: { Authorization: `Bearer ${localStorage.getItem('jwt')}` },
				})
				if (!res.ok) throw new Error('Not logged in')
				const data = await res.json()
				const characters = data.wow_accounts[0].characters

				const leaderSelect = document.getElementById('create-group-leader')
				leaderSelect.innerHTML = characters
					.map(
						(char) =>
							`<option value="${char.name}" style="color: ${char.classColor};">${char.name}</option>`
					)
					.join('')
			} catch (err) {
				console.error('Failed to fetch character data:', err)

				// If not logged in, show message inside modal
				groupModal.innerHTML = `
				<div class="modal-content">
				  <span class="close-btn" id="close-group-create-btn">&times;</span>
				  <p style="text-align: center; font-size: 1.2rem; margin-top: 20px;">Please log in to create a group</p>
				</div>
			  `
				document
					.getElementById('close-group-create-btn')
					.addEventListener('click', () => {
						groupModal.style.display = 'none'
					})
			}
		})
	}

	// Modal close button
	if (closeBtn && groupModal) {
		closeBtn.addEventListener('click', () => {
			groupModal.style.display = 'none'
		})
	}
}

// Load about page content
function loadAboutPage(content) {
	content.innerHTML = `
	<div class="content-wrapper">
		<h1>About Us</h1>
		<p>I hate boomkins</p>
	</div>
	`
}

// Load login/profile page content
function loadLoginPage(content) {
	content.innerHTML = ''

	// Fetch profile data using stored JWT
	fetch('/api/profile', {
		headers: { Authorization: `Bearer ${localStorage.getItem('jwt')}` },
	})
		.then((response) => {
			if (!response.ok) throw new Error('Not logged in')
			return response.json()
		})
		.then((data) => {
			const characters = data.wow_accounts[0].characters
			if (characters.length === 0) {
				content.innerHTML = `<p>No level 80 characters found.</p>`
				return
			}

			// Render character cards
			const characterCardsHTML = characters
				.map((char) => {
					const mythicScore = char.mythic_plus_score || 'N/A'
					const characterMedia =
						char.media.avatar_url || 'default-character.png'
					const classColor = char.classColor || '#FFFFFF'

					return `
				<div class="character-card">
				  <img src="${characterMedia}" class="character-avatar"/>
				  <div class="character-info">
					<h3>${char.name}</h3>
					<p>Level: ${char.level}</p>
					<p>
					  Class:
					  <span style="color: ${classColor};">
						${char.class || 'unknown'}
					  </span>
					</p>
					<p>Mythic+ Score: ${mythicScore}</p>
				  </div>
				</div>
			  `
				})
				.join('')

			content.innerHTML = `
				<div class="content-wrapper">
					<h2>Welcome, select your character:</h2>
					<div class="character-cards-container">
						${characterCardsHTML}
					</div>
					<button class="drk-btn" id="logout-btn">Logout</button>
				</div>
            `

			// Logout: clear JWT and reload to home
			document.getElementById('logout-btn').addEventListener('click', () => {
				localStorage.removeItem('jwt')
				window.location.href = '/'
			})

			document.getElementById('login-nav').innerHTML = 'Profile'
		})
		.catch(() => {
			// Update nav link to say "Profile"
			content.innerHTML = `
				<div class="content-wrapper">
					<h1>Login</h1>
					<p>Log in to show your character information.</p>
					<a href="/auth/login">
						<button class="drk-btn" id="login-btn">Login with Battle.net</button>
					</a>
				</div>
            `
		})
}

// --- FORM SUBMISSION HANDLERS ---

// TODO: add errors to modal and remove alerts
function handleCreateGroupSubmit(e) {
	e.preventDefault()

	const formData = {
		title: document.getElementById('create-title').value,
		description: document.getElementById('create-description').value,
		dateTime: document.getElementById('create-date-time').value,
		character: document.getElementById('create-group-leader').value,
		role: document.getElementById('create-leader-role').value,
	}

	const errors = validateCreateGroupForm(formData)

	if (errors.length > 0) {
		alert(errors.join('\n'))
		return
	}

	// proceed to create group
	console.log('Creating group:', formData)
}

function handleApplyGroupSubmit(e) {
	e.preventDefault()

	const formData = {
		character: document.getElementById('create-group-leader').value,
		role: document.getElementById('create-leader-role').value,
		note: document.getElementById('group-character-note').value,
	}

	const errors = validateApplyGroupForm(formData)

	if (errors.length > 0) {
		alert(errors.join('\n'))
		return
	}

	// proceed to apply to group
	console.log('Applying to group:', formData)
}

// --- HELPER FUNCTIONS ---

function attachFormListeners() {
	const createGroupForm = document.getElementById('create-group-form')
	const applyGroupForm = document.getElementById('apply-group-form')

	if (createGroupForm) {
		createGroupForm.addEventListener('submit', handleCreateGroupSubmit)
	}

	if (applyGroupForm) {
		applyGroupForm.addEventListener('submit', handleApplyGroupSubmit)
	}
}

// --- EVENT LISTENERS ---

// Load the appropriate content on first page load and when hash changes
window.addEventListener('load', () => {
	loadContent()
	attachFormListeners()
})
window.addEventListener('hashchange', loadContent)
