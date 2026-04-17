document.addEventListener('DOMContentLoaded', () => {

	const toastTrigger = document.getElementById('liveToastBtn');
	const toastLiveExample = document.getElementById('liveToast');

	if (toastTrigger && toastLiveExample) {
		toastTrigger.addEventListener('click', () => {
			window.appUiRuntime?.showToast?.(toastLiveExample);
		});
	}

});
