function loadContent() {
	const content = document.getElementById('content')
	const hash = window.location.hash

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

// Functions to load each page's content (content is loaded dynamically)
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
		<p>This is the main page of the website.</p>
	</div>
	`
	const groupModal = document.getElementById('group-create-modal')
	const createGroupBtn = document.getElementById('create-group-btn')
	const closeBtn = document.getElementById('close-group-create-btn')

	if (createGroupBtn && groupModal) {
		createGroupBtn.addEventListener('click', async () => {
			groupModal.style.display = 'flex'

			try {
				// Fetch character data
				const res = await fetch('/api/profile')
				if (!res.ok) {
					throw new Error('Not logged in')
				}
				const data = await res.json()
				const characters = data.wow_accounts[0].characters

				// Populate the dropdown
				const leaderSelect = document.getElementById('create-group-leader')
				leaderSelect.innerHTML = characters
					.map(
						(char) =>
							`<option value="${char.name}" style="color: ${char.classColor};">${char.name}</option>`
					)
					.join('')
			} catch (err) {
				console.error('Failed to fetch character data:', err)
				// Update the modal content with a message asking the user to log in
				groupModal.innerHTML = `
				<div class="modal-content">
				  <span class="close-btn" id="close-group-create-btn">&times;</span>
				  <p style="text-align: center; font-size: 1.2rem; margin-top: 20px;">Please log in to create a group</p>
				</div>
			  `
				// Reattach the close listener on the new close button
				document
					.getElementById('close-group-create-btn')
					.addEventListener('click', () => {
						groupModal.style.display = 'none'
					})
			}
		})
	}

	if (closeBtn && groupModal) {
		closeBtn.addEventListener('click', () => {
			groupModal.style.display = 'none'
		})
	}
}

function loadAboutPage(content) {
	content.innerHTML = `
	<div class="content-wrapper">
		<h1>About Us</h1>
		<p>Learn more about our website and mission.</p>
	</div>
	`
}

function loadLoginPage(content) {
	// Clear the content
	content.innerHTML = ''

	// Check if the user is logged in by fetching profile
	fetch('/api/profile')
		.then((response) => {
			if (!response.ok) throw new Error('Not logged in')
			return response.json()
		})
		.then((data) => {
			const characters = data.wow_accounts[0].characters
			if (characters.length === 0) {
				content.innerHTML = `<p>No characters found.</p>`
				return
			}

			// Create cards for each character
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

			// Show the character cards
			content.innerHTML = `
				<div class="content-wrapper">
					<h2>Welcome, select your character:</h2>
					<div class="character-cards-container">
						${characterCardsHTML}
					</div>
					<button class="drk-btn" id="logout-btn">Logout</button>
				</div>
            `

			// Add logout event listener
			document.getElementById('logout-btn').addEventListener('click', () => {
				window.location.href = '/auth/logout'
			})

			// Change the login button to 'Profile'
			document.getElementById('login-nav').innerHTML = 'Profile'
		})
		.catch(() => {
			// If not logged in, show the login section
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

// Load content when the page loads
window.addEventListener('load', () => {
	loadContent()
})

// Detect URL hash change and load the corresponding page
window.addEventListener('hashchange', loadContent)
