/**
 * Basic form validation for creating and applying to groups
 */

// Validate Create Group form fields
export function validateCreateGroupForm({
	title,
	description,
	dateTime,
	character,
	role,
}) {
	const errors = []

	if (!title.trim()) {
		errors.push('Title is required.')
	}

	if (!description.trim()) {
		errors.push('Description is required.')
	}

	if (!/^\d{2}-\d{2} \d{2}:\d{2}$/.test(dateTime)) {
		errors.push('Date must be in MM-DD HH:mm format.')
	}

	if (!character) {
		errors.push('You must select a character.')
	}

	if (!role) {
		errors.push('You must select a role.')
	}

	return errors
}

// Validate Apply to Group form fields
export function validateApplyGroupForm({ character, role, note }) {
	const errors = []

	if (!character) {
		errors.push('You must select a character.')
	}

	if (!role) {
		errors.push('You must select a role.')
	}

	if (note.length > 200) {
		errors.push('Note must be under 200 characters.')
	}

	return errors
}
