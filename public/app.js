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
	<form id="search-form">
        <input id="search-input" type="text" placeholder="Search groups">
        <button id="search-btn" type="submit">Search</button>
    </form>
	<div class="content-wrapper">
		<h1>Welcome to the Home Page!</h1>
		<p>This is the main page of the website.</p>
	</div>
	`
}

function loadAboutPage(content) {
	content.innerHTML = `
	<h1>About Us</h1>
	<p>Learn more about our website and mission.</p>
	`
}

function loadLoginPage(content) {
	// Clear the content
	content.innerHTML = ''

	// Check if user is logged in by fetching profile
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

			// Create a dropdown list with all characters
			const characterListHTML = characters
				.map((char, index) => {
					return `<option value="${index}">${char.name} - Level ${char.level} (${char.realm.name})</option>`
				})
				.join('')

			// Show the character selection dropdown
			content.innerHTML = `
                <h2>Welcome, select your character:</h2>
                <select id="character-select">
                    ${characterListHTML}
                </select>
                <div id="character-details"></div>
                <button id="logout-btn">Logout</button>
            `

			// Event listener to display details of the selected character
			const selectElement = document.getElementById('character-select')
			const characterDetails = document.getElementById('character-details')
			selectElement.addEventListener('change', (event) => {
				const selectedCharacter = characters[event.target.value]
				characterDetails.innerHTML = `
                    <h3>${selectedCharacter.name}</h3>
                    <p>Level: ${selectedCharacter.level}</p>
                    <p>Realm: ${selectedCharacter.realm.name}</p>
                `
			})

			// Trigger the details of the first character by default
			selectElement.dispatchEvent(new Event('change'))

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
                <h1>Login</h1>
                <p>Log in to show your character information.</p>
                <a href="/auth/login">
                    <button id="login-btn">Login with Battle.net</button>
                </a>
            `
		})
}

// Load content when the page loads
window.addEventListener('load', () => {
	loadContent()
})

// Detect URL hash change and load the corresponding page
window.addEventListener('hashchange', loadContent)
