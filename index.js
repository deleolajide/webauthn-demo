var users = {};

window.onload = function() {
  // check whether current browser supports WebAuthn
  if (!window.PublicKeyCredential) {
	alert("Error: this browser does not support WebAuthn");
	return;
  }

	var lsUsers = localStorage.getItem('users');

	if (lsUsers) {
	  users = JSON.parse(lsUsers);
	  showUsers();
	};  
	initialize();  
};

// Base64 to ArrayBuffer
function bufferDecode(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

// ArrayBuffer to URLBase64
function bufferEncode(value) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(value)))
	.replace(/\+/g, "-")
	.replace(/\//g, "_")
	.replace(/=/g, "");;
}

function reset() {
  users = {};
  showUsers();
}

function showUsers() {
  document.querySelector('#users').innerHTML = JSON.stringify(users, null, 4);
  localStorage.setItem('users', JSON.stringify(users));
}

function initialize() {
  WebAuthnGoJS.CreateContext(JSON.stringify({
	RPDisplayName: "Foobar Corp.",
		RPID:          window.location.hostname,
		RPOrigin:      window.location.origin,
		// RPIcon:        "https://foobar.corp/logo.png",
  }), (err, val) => {
	if (err) {
	  alert(err);
	  document.querySelector('#ready').innerHTML = "Failed!";
	} else {
	  document.querySelector('#ready').innerHTML = "Ready!"
	  document.querySelector('#ready').style.color = 'blue'; 	  
	}
  });
}

function registerUser() {
  username = document.querySelector("#email").value;
  
  if (username === "") {
	alert("Please enter a username");
	return;
  }

  if (!users[username]) users[username] = {
	id: Math.floor(Math.random() * 1000000000),
	name: username,
	displayName: username,
	credentials: [],
  };

  const createPromiseFunc = (credentialCreationOptions) => {
	credentialCreationOptions.publicKey.challenge = bufferDecode(credentialCreationOptions.publicKey.challenge);
	credentialCreationOptions.publicKey.user.id = bufferDecode(credentialCreationOptions.publicKey.user.id);
	if (credentialCreationOptions.publicKey.excludeCredentials) {
	  for (var i = 0; i < credentialCreationOptions.publicKey.excludeCredentials.length; i++) {
		credentialCreationOptions.publicKey.excludeCredentials[i].id = bufferDecode(credentialCreationOptions.publicKey.excludeCredentials[i].id);
	  }
	}

	return navigator.credentials.create({
	  publicKey: credentialCreationOptions.publicKey
	})
  }

  const user = users[username];
  const userStr = JSON.stringify(user);

  WebAuthnGoJS.BeginRegistration(userStr, (err, data) => {
	if (err) {
	  alert(err); return;
	}

	// Parse JSON
	data = JSON.parse(data);

	// Store registration data in session
	users[username].registrationSessionData = data.registrationSessionData;
	showUsers();

	// Get the client credentials if we can
	createPromiseFunc(data.credentialCreationOptions).then((credential) => {
	  let attestationObject = credential.response.attestationObject;
	  let clientDataJSON = credential.response.clientDataJSON;
	  let rawId = credential.rawId;

	  const registrationBody = {
		id: credential.id,
		rawId: bufferEncode(rawId),
		type: credential.type,
		response: {
		  attestationObject: bufferEncode(attestationObject),
		  clientDataJSON: bufferEncode(clientDataJSON),
		},
	  };

	  // Stringify
	  const regBodyStr = JSON.stringify(registrationBody);
	  const sessDataStr = JSON.stringify(users[username].registrationSessionData)

	  WebAuthnGoJS.FinishRegistration(userStr, sessDataStr, regBodyStr, (err, result) => {
		delete users[username].registrationSessionData;

		if (err) alert(err);
		else {
		  const credential = JSON.parse(result);
		  user.credentials.push(credential);
		  showUsers();

		  alert('Registration Successful');
		}
	  });
	}).catch((err) => {
	  alert(err);
	  delete user.registrationSessionData;
	  showUsers();
	});
  })
}

function loginUser() {
  username = document.querySelector("#email").value;
  
  if (username === "") {
	alert("Please enter a username");
	return;
  }

  if (!users[username]) {
	alert('No user registered'); return;
  }
  const user = users[username];
  const userStr = JSON.stringify(user);

  const loginCredRequest = (credentialRequestOptions) => {
	credentialRequestOptions.publicKey.challenge = bufferDecode(credentialRequestOptions.publicKey.challenge);
	credentialRequestOptions.publicKey.allowCredentials.forEach(function (listItem) {
	  listItem.id = bufferDecode(listItem.id)
	});

	return navigator.credentials.get({
	  publicKey: credentialRequestOptions.publicKey
	})
  }

  WebAuthnGoJS.BeginLogin(userStr, (err, data) => {
	if (err) {
	  alert(err); return;
	}

	// Parse JSON
	data = JSON.parse(data);

	// Store authentication data in session
	user.authenticationSessionData = data.authenticationSessionData;
	showUsers();

	loginCredRequest(data.credentialRequestOptions).then((assertion) => {
	  let authData = assertion.response.authenticatorData;
	  let clientDataJSON = assertion.response.clientDataJSON;
	  let rawId = assertion.rawId;
	  let sig = assertion.response.signature;
	  let userHandle = assertion.response.userHandle;

	  const finishLoginObj = {
		  id: assertion.id,
		  rawId: bufferEncode(rawId),
		  type: assertion.type,
		  response: {
			authenticatorData: bufferEncode(authData),
			clientDataJSON: bufferEncode(clientDataJSON),
			signature: bufferEncode(sig),
			userHandle: bufferEncode(userHandle),
		  },
	  }

	  // Stringify
	  const loginBodyStr = JSON.stringify(finishLoginObj);
	  const authSessDataStr = JSON.stringify(user.authenticationSessionData)

	  WebAuthnGoJS.FinishLogin(userStr, authSessDataStr, loginBodyStr, (err, result) => {
		delete user.authenticationSessionData;
		showUsers();
		alert(err || result);
	  });
	}).catch((err) => {
	  alert(err);
	  delete user.authenticationSessionData;
	  showUsers();
	});
  });
}