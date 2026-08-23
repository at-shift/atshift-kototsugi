(function (window, document) {
	'use strict';

	function maskValue(value) {
		return Array.from(value).map(function () {
			return '\u2022';
		}).join('');
	}

	function updateMask(field) {
		var wrapper = field.closest('.kototsugi-passphrase-field');

		if (wrapper) {
			wrapper.dataset.mask = field.classList.contains('is-masked') ? maskValue(field.value) : '';
		}
	}

	Array.prototype.forEach.call(document.querySelectorAll('.kototsugi-passphrase-input'), function (field) {
		var wrapper = field.closest('.kototsugi-passphrase-field');

		field.classList.add('is-masked');
		updateMask(field);

		field.addEventListener('input', function () {
			updateMask(field);
		});
		field.addEventListener('compositionstart', function () {
			if (wrapper) {
				wrapper.classList.add('is-composing');
			}
		});
		field.addEventListener('compositionend', function () {
			if (wrapper) {
				wrapper.classList.remove('is-composing');
			}
			updateMask(field);
		});
	});

	document.addEventListener('click', function (event) {
		var button = event.target.closest('[data-kototsugi-passphrase-toggle]');
		var field;
		var icon;
		var label;
		var showing;

		if (!button) {
			return;
		}

		field = document.getElementById(button.getAttribute('aria-controls'));
		if (!field) {
			return;
		}

		showing = field.classList.contains('is-masked');
		field.classList.toggle('is-masked', !showing);
		updateMask(field);
		label = showing ? button.dataset.hideLabel : button.dataset.showLabel;
		button.setAttribute('aria-pressed', showing ? 'true' : 'false');
		button.setAttribute('aria-label', label);
		button.setAttribute('title', label);

		icon = button.querySelector('.dashicons');
		if (icon) {
			icon.classList.toggle('dashicons-visibility', !showing);
			icon.classList.toggle('dashicons-hidden', showing);
		}

		label = button.querySelector('.screen-reader-text');
		if (label) {
			label.textContent = showing ? button.dataset.hideLabel : button.dataset.showLabel;
		}
	});
}(window, document));
