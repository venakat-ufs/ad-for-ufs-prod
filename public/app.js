document.addEventListener('DOMContentLoaded', () => {
  const roleCards = document.querySelectorAll('.role-card');
  const step1 = document.getElementById('step-1');
  const step2 = document.getElementById('step-2');
  const progress = document.getElementById('progress-text');
  const roleInput = document.getElementById('role-input');
  const roleChip = document.getElementById('role-chip');
  const stepDescription = document.getElementById('step-description');
  const form = document.getElementById('lead-form');
  const submitBtn = document.getElementById('submit-btn');
  const backButton = document.getElementById('back-button');
  const backTop = document.getElementById('back-top');
  const errorBanner = document.getElementById('error-banner');
  const successCard = document.getElementById('success-card');
  const formCard = document.getElementById('form-card');
  const suggestBtn = document.getElementById('suggest-btn');
  const suggestionText = document.getElementById('suggestion-text');
  const suggestionModal = document.getElementById('suggestion-modal');
  const suggestionModalList = document.getElementById('suggestion-modal-list');
  const suggestionModalClose = document.getElementById('suggestion-modal-close');
  const payBtn = document.getElementById('pay-btn');
  const priceAmount = document.getElementById('price-amount');
  const suggestionGrid = document.getElementById('suggestion-grid');
  const suggestionEmpty = document.getElementById('suggestion-empty');
  const descriptionField = document.getElementById('description');
  const streetField = document.getElementById('streetAddress');
  const zipField = document.getElementById('zipCode');
  const cityField = document.getElementById('city');
  const stateField = document.getElementById('state');
  const flowStepsContainer = document.querySelector('.flow-steps');
  const chipButtons = Array.from(document.querySelectorAll('.chip-btn'));
  const flowSteps = Array.from(document.querySelectorAll('.flow-step'));
  const flowStages = Array.from(document.querySelectorAll('.flow-stage'));
  const nextStep1 = document.getElementById('next-step-1');
  const nextStep2 = document.getElementById('next-step-2');
  const prevStep2 = document.getElementById('prev-step-2');

  let selectedRole = null;
  let currentSubStep = 1;
  let currentPriceCents = null;
  let lastSuggestedDescription = '';
  let suggestionTimer = null;
  let geoLookupTimer = null;
  let lastGeoLookupKey = '';
  let autocomplete = null;

  // Initialize Google Places Autocomplete
  async function initGooglePlaces() {
    try {
      const response = await fetch('/api/maps-config');
      const { apiKey } = await response.json();
      if (!apiKey) return;

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initAutocomplete`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } catch (error) {
      console.error('Failed to load Google Maps:', error);
    }
  }

  window.initAutocomplete = function () {
    if (!streetField) return;

    autocomplete = new google.maps.places.Autocomplete(streetField, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address']
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;

      let streetNumber = '';
      let route = '';
      let city = '';
      let state = '';
      let zip = '';
      let zipSuffix = '';

      place.address_components.forEach((component) => {
        const types = component.types;
        if (types.includes('street_number')) streetNumber = component.long_name;
        if (types.includes('route')) route = component.long_name;
        // City can be in different fields depending on location
        if (types.includes('locality')) city = component.long_name;
        if (!city && types.includes('sublocality_level_1')) city = component.long_name;
        if (!city && types.includes('administrative_area_level_2')) city = component.long_name;
        if (!city && types.includes('neighborhood')) city = component.long_name;
        if (types.includes('administrative_area_level_1')) state = component.short_name;
        if (types.includes('postal_code')) zip = component.long_name;
        if (types.includes('postal_code_suffix')) zipSuffix = component.long_name;
      });

      // Combine zip with suffix if available (e.g., 12345-6789)
      const fullZip = zipSuffix ? `${zip}-${zipSuffix}` : zip;

      const fullStreet = [streetNumber, route].filter(Boolean).join(' ');
      streetField.value = fullStreet;

      if (cityField && city) {
        cityField.value = city;
        cityField.dataset.autofill = 'true';
      }
      if (stateField && state) {
        stateField.value = state;
        stateField.dataset.autofill = 'true';
      }
      if (zipField && fullZip) {
        zipField.value = fullZip;
        zipField.dataset.autofill = 'true';
      }

      // Fallback: if ZIP is missing, use AI to look it up
      if (!fullZip && fullStreet && city && state) {
        if (zipField) {
          zipField.placeholder = 'Looking up ZIP...';
        }
        fetch('/api/lookup-zipcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ street: fullStreet, city, state })
        })
          .then((res) => res.json())
          .then((result) => {
            if (result?.success && result.zipCode && zipField) {
              zipField.value = result.zipCode;
              zipField.dataset.autofill = 'true';
              zipField.placeholder = 'ZIP code';
            } else if (zipField) {
              zipField.placeholder = 'Enter ZIP code';
            }
          })
          .catch(() => {
            if (zipField) zipField.placeholder = 'Enter ZIP code';
          });
      }
    });
  };

  initGooglePlaces();

  // Geolocation - Use My Location button
  const locationBtn = document.getElementById('use-location-btn');
  if (locationBtn) {
    locationBtn.addEventListener('click', handleUseLocation);
  }

  async function handleUseLocation() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    const btn = locationBtn;
    const originalText = btn.querySelector('.location-text').textContent;
    btn.disabled = true;
    btn.querySelector('.location-text').textContent = 'Getting location...';

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch('/api/reverse-geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: latitude, lng: longitude })
          });
          const data = await response.json();

          if (data.success) {
            if (data.city && cityField) {
              cityField.value = data.city;
              cityField.dataset.autofill = 'true';
            }
            if (data.state && stateField) {
              stateField.value = data.state;
              stateField.dataset.autofill = 'true';
            }
            if (data.zip && zipField) {
              zipField.value = data.zip;
              zipField.dataset.autofill = 'true';
            }
            btn.querySelector('.location-text').textContent = 'Location found!';
            setTimeout(() => {
              btn.querySelector('.location-text').textContent = originalText;
            }, 2000);
          } else {
            btn.querySelector('.location-text').textContent = 'Location not found';
            setTimeout(() => {
              btn.querySelector('.location-text').textContent = originalText;
            }, 2000);
          }
        } catch (err) {
          console.error('Reverse geocode error:', err);
          btn.querySelector('.location-text').textContent = 'Failed to get location';
          setTimeout(() => {
            btn.querySelector('.location-text').textContent = originalText;
          }, 2000);
        }
        btn.disabled = false;
      },
      (error) => {
        console.error('Geolocation error:', error);
        let msg = 'Location access denied';
        if (error.code === 2) msg = 'Location unavailable';
        if (error.code === 3) msg = 'Location timed out';
        btn.querySelector('.location-text').textContent = msg;
        setTimeout(() => {
          btn.querySelector('.location-text').textContent = originalText;
        }, 2000);
        btn.disabled = false;
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  const clientFields = [
    'description',
    'serviceSuggestion',
    'serviceNeeded',
    'streetAddress',
    'zipCode',
    'city',
    'state',
    'priceSummary'
  ];

  roleCards.forEach((card) => {
    card.addEventListener('click', () => {
      selectRole(card.dataset.role);
    });
  });

  const urlRole = new URLSearchParams(window.location.search).get('role');
  const initialRole = urlRole === 'client' ? 'client' : 'client';
  if (initialRole) {
    selectRole(initialRole);
  }

  const handleBackNavigation = () => {
    if (step2.classList.contains('hidden')) {
      showStep(1);
      return;
    }
    if (currentSubStep > 1) {
      showSubStep(currentSubStep - 1);
    } else {
      showStep(1);
    }
  };

  backButton.addEventListener('click', handleBackNavigation);

  if (backTop) {
    backTop.addEventListener('click', handleBackNavigation);
  }

  chipButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const label = button.textContent.trim();
      if (!label) return;
      const current = form.description.value.trim();
      const lower = current.toLowerCase();
      if (lower.includes(label.toLowerCase())) {
        form.description.focus();
        return;
      }
      const separator = current ? (current.endsWith('.') ? ' ' : ', ') : '';
      form.description.value = `${current}${separator}${label}`;
      form.description.focus();
      scheduleSuggestions();
    });
  });

  // Occupancy toggle logic
  const occupancyBtns = Array.from(document.querySelectorAll('.occupancy-btn'));
  const occupancyInput = document.getElementById('occupancyStatus');
  const vacantDetails = document.getElementById('vacant-details');
  const occupiedDetails = document.getElementById('occupied-details');
  const entryChips = Array.from(document.querySelectorAll('.entry-chip'));
  const entryMethodField = document.getElementById('entryMethod');

  occupancyBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      occupancyBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (occupancyInput) occupancyInput.value = value;

      if (value === 'vacant') {
        vacantDetails?.classList.remove('hidden');
        occupiedDetails?.classList.add('hidden');
      } else if (value === 'occupied') {
        vacantDetails?.classList.add('hidden');
        occupiedDetails?.classList.remove('hidden');
      }
    });
  });

  entryChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      entryChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const entryType = chip.dataset.entry;
      if (entryMethodField) {
        const currentVal = entryMethodField.value.trim();
        if (entryType === 'Lockbox') {
          entryMethodField.placeholder = 'Enter lockbox code (e.g., 1234)';
          if (!currentVal) entryMethodField.value = 'Lockbox code: ';
        } else if (entryType === 'Key under mat') {
          entryMethodField.placeholder = 'Describe key location';
          if (!currentVal) entryMethodField.value = 'Key location: ';
        } else if (entryType === 'Code entry') {
          entryMethodField.placeholder = 'Enter door/gate code';
          if (!currentVal) entryMethodField.value = 'Entry code: ';
        } else {
          entryMethodField.placeholder = 'Describe how to enter the property...';
          entryMethodField.value = '';
        }
        entryMethodField.focus();
      }
    });
  });

  if (descriptionField) {
    descriptionField.addEventListener('input', scheduleSuggestions);
    descriptionField.addEventListener('blur', () => {
      if (form.description.value.trim()) {
        requestSuggestions();
      }
    });
  }

  if (zipField) {
    zipField.addEventListener('input', () => {
      delete zipField.dataset.autofill;
      scheduleGeoLookup();
    });
    zipField.addEventListener('blur', () => {
      if (zipField.value.trim()) {
        lookupLocation();
      }
    });
  }

  if (streetField) {
    streetField.addEventListener('blur', () => {
      if (zipField && zipField.value.trim()) {
        lookupLocation();
      }
    });
  }

  [cityField, stateField].forEach((field) => {
    if (!field) return;
    field.addEventListener('input', () => {
      delete field.dataset.autofill;
    });
  });

  if (nextStep1) {
    nextStep1.addEventListener('click', () => {
      if (validateSubStep(1)) {
        showSubStep(2);
      }
    });
  }

  if (nextStep2) {
    nextStep2.addEventListener('click', () => {
      if (validateSubStep(2)) {
        showSubStep(3);
      }
    });
  }

  if (prevStep2) {
    prevStep2.addEventListener('click', () => {
      showSubStep(1);
    });
  }


  if (form.serviceNeeded) {
    form.serviceNeeded.addEventListener('change', () => {
      updatePricePreview();
    });
  }

  if (payBtn) {
    payBtn.addEventListener('click', () => {
      handleLeadSubmit({ redirectToPayment: true });
    });
  }

  if (suggestBtn && suggestionText) {
    suggestBtn.addEventListener('click', () => {
      requestSuggestions();
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleLeadSubmit({ redirectToPayment: false });
  });

  function showStep(stepNumber) {
    if (stepNumber === 1) {
      step1.classList.remove('hidden');
      step2.classList.add('hidden');
      progress.textContent = 'Step 1 of 2';
    } else {
      step1.classList.add('hidden');
      step2.classList.remove('hidden');
      progress.textContent = 'Step 2 of 2';
      showSubStep(1);
    }
  }

  function selectRole(role) {
    selectedRole = role;
    roleInput.value = selectedRole;
    roleCards.forEach((c) => c.classList.toggle('active', c.dataset.role === selectedRole));
    showStep(2);
    updateRoleUI();
    resetPricePreview();
  }

  function updateRoleUI() {
    if (roleChip) roleChip.textContent = 'Client';
    if (stepDescription) {
      stepDescription.textContent =
        "Describe your issue, and we'll match you with the best service.";
    }
    toggleRoleFields('client');
  }

  function showSubStep(stepNumber) {
    currentSubStep = stepNumber;
    flowStages.forEach((stage) => {
      const stageStep = Number(stage.dataset.step);
      stage.classList.toggle('hidden', stageStep !== stepNumber);
    });
    flowSteps.forEach((step) => {
      const stepIndex = Number(step.dataset.step);
      const number = step.querySelector('.flow-step-number');
      step.classList.toggle('active', stepIndex < stepNumber);
      step.classList.toggle('current', stepIndex === stepNumber);
      if (number) {
        number.textContent = stepIndex < stepNumber ? '\u2713' : String(stepIndex);
      }
    });
    if (flowStepsContainer && flowSteps.length > 1) {
      const progress = (stepNumber - 1) / (flowSteps.length - 1);
      flowStepsContainer.style.setProperty('--progress-scale', progress.toString());
    }
  }

  function validateSubStep(stepNumber) {
    clearErrors();
    let valid = true;

    if (stepNumber === 1) {
      const description = form.description.value.trim();
      if (!description) {
        setError('description', 'Description is required.');
        valid = false;
      }
      const serviceNeeded = form.serviceNeeded.value;
      if (!serviceNeeded) {
        setError('serviceNeeded', 'Please select a service.');
        valid = false;
      }
    }

    if (stepNumber === 2) {
      const streetAddress = form.streetAddress.value.trim();
      const zipCode = form.zipCode.value.trim();
      const city = form.city.value.trim();
      const state = form.state.value.trim();
      if (!streetAddress) {
        setError('streetAddress', 'Street address is required.');
        valid = false;
      }
      if (!zipCode) {
        setError('zipCode', 'ZIP code is required.');
        valid = false;
      }
      if (!city) {
        setError('city', 'City is required.');
        valid = false;
      }
      if (!state) {
        setError('state', 'State is required.');
        valid = false;
      }
      const name = form.name.value.trim();
      const email = form.email.value.trim();
      const phone = form.phone.value.trim();
      const companyName = form.companyName.value.trim();
      if (!name) {
        setError('name', 'Name is required.');
        valid = false;
      }
      if (!email) {
        setError('email', 'Email is required.');
        valid = false;
      } else if (!isValidEmail(email)) {
        setError('email', 'Please enter a valid email.');
        valid = false;
      }
      if (!phone) {
        setError('phone', 'Phone is required.');
        valid = false;
      }
      if (!companyName) {
        setError('companyName', 'Company name is required.');
        valid = false;
      }
    }

    return valid;
  }

  function scheduleSuggestions() {
    if (!descriptionField) return;
    const description = form.description.value.trim();
    if (!description) {
      resetSuggestion();
      return;
    }
    if (suggestionTimer) clearTimeout(suggestionTimer);
    suggestionTimer = setTimeout(() => {
      requestSuggestions();
    }, 700);
  }

  function scheduleGeoLookup() {
    if (!zipField) return;
    const zip = zipField.value.trim();
    if (!zip) {
      clearLocationAutofill();
      lastGeoLookupKey = '';
      return;
    }
    if (geoLookupTimer) clearTimeout(geoLookupTimer);
    geoLookupTimer = setTimeout(() => {
      lookupLocation();
    }, 600);
  }

  async function lookupLocation() {
    if (!zipField) return;
    const zip = zipField.value.trim();
    if (!zip) return;
    const street = streetField ? streetField.value.trim() : '';
    const city = cityField ? cityField.value.trim() : '';
    const state = stateField ? stateField.value.trim() : '';
    const lookupKey = `${zip}|${street}`;
    if (lookupKey === lastGeoLookupKey) return;
    lastGeoLookupKey = lookupKey;

    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip, street, city, state })
      });
      if (!response.ok) {
        throw new Error('Geocode failed');
      }
      const result = await response.json();
      if (!result?.success) {
        return;
      }
      applyLocationAutofill(result);
    } catch (error) {
      // Ignore lookup failures and allow manual entry.
    }
  }

  function applyLocationAutofill(result) {
    setAutofillValue(cityField, result.city);
    setAutofillValue(stateField, result.state);
    if (result.postalCode) {
      setAutofillValue(zipField, result.postalCode);
    }
  }

  function setAutofillValue(field, value) {
    if (!field || !value) return;
    const shouldOverwrite = !field.value || field.dataset.autofill === 'true';
    if (!shouldOverwrite) return;
    field.value = value;
    field.dataset.autofill = 'true';
  }

  function clearLocationAutofill() {
    [cityField, stateField].forEach((field) => {
      if (field && field.dataset.autofill === 'true') {
        field.value = '';
        delete field.dataset.autofill;
      }
    });
  }

  async function requestSuggestions() {
    if (!suggestionText) return;
    clearFieldError('description');
    const description = form.description.value.trim();
    if (!description) {
      resetSuggestion();
      return;
    }

    if (
      description === lastSuggestedDescription &&
      suggestionGrid &&
      suggestionGrid.childElementCount
    ) {
      return;
    }

    suggestionText.textContent = 'Generating recommendations...';
    suggestionText.classList.remove('suggestion-strong', 'hidden');
    clearSuggestionModal();

    try {
      const response = await fetch('/api/suggest-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
      });

      if (!response.ok) {
        throw new Error('Suggestion failed');
      }

      const result = await response.json();
      const suggestions = Array.isArray(result?.suggestions)
        ? result.suggestions.filter(Boolean)
        : [];
      const prices = result?.prices && typeof result.prices === 'object' ? result.prices : {};

      if (suggestions.length) {
        suggestionText.textContent = '';
        suggestionText.classList.add('hidden');
        showSuggestionModal(suggestions, prices);
        lastSuggestedDescription = description;
      } else {
        suggestionText.textContent = 'No recommendation available. Please choose a service.';
        suggestionText.classList.remove('hidden');
      }
    } catch (error) {
      suggestionText.textContent = 'Unable to suggest right now. Please choose a service.';
      suggestionText.classList.remove('hidden');
    }
  }

  function toggleRoleFields(role) {
    const showClient = role === 'client';

    clientFields.forEach((field) => toggleField(field, showClient));
  }

  function toggleField(fieldName, shouldShow) {
    const group = form.querySelector(`[data-field="${fieldName}"]`);
    if (!group) return;

    const input = group.querySelector('input, select, textarea');
    const isRequired = group.dataset.required !== 'false';
    group.classList.toggle('hidden-field', !shouldShow);
    if (input) {
      input.required = shouldShow && isRequired;
      if (!shouldShow) {
        input.value = '';
        delete input.dataset.autofill;
      }
    }
  }

  function getAddressParts() {
    return {
      streetAddress: form.streetAddress ? form.streetAddress.value.trim() : '',
      aptSuite: form.aptSuite ? form.aptSuite.value.trim() : '',
      zipCode: form.zipCode ? form.zipCode.value.trim() : '',
      city: form.city ? form.city.value.trim() : '',
      state: form.state ? form.state.value.trim() : ''
    };
  }

  function buildPropertyAddress() {
    const { streetAddress, aptSuite, city, state, zipCode } = getAddressParts();
    const fullStreet = aptSuite ? `${streetAddress}, ${aptSuite}` : streetAddress;
    const cityState = [city, state].filter(Boolean).join(', ');
    const cityStateZip = [cityState, zipCode].filter(Boolean).join(' ').trim();
    return [fullStreet, cityStateZip].filter(Boolean).join(', ');
  }

  function validateForm() {
    let valid = true;

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const companyName = form.companyName.value.trim();
    const { streetAddress, zipCode, city, state } = getAddressParts();
    const propertyAddress = buildPropertyAddress();
    const description = form.description.value.trim();
    const serviceNeeded = form.serviceNeeded.value;

    if (!name) {
      setError('name', 'Name is required.');
      valid = false;
    }

    if (!email) {
      setError('email', 'Email is required.');
      valid = false;
    } else if (!isValidEmail(email)) {
      setError('email', 'Please enter a valid email.');
      valid = false;
    }

    if (!phone) {
      setError('phone', 'Phone is required.');
      valid = false;
    }

    if (!companyName) {
      setError('companyName', 'Company name is required.');
      valid = false;
    }

    if (selectedRole === 'client') {
      if (!streetAddress) {
        setError('streetAddress', 'Street address is required.');
        valid = false;
      }
      if (!zipCode) {
        setError('zipCode', 'ZIP code is required.');
        valid = false;
      }
      if (!city) {
        setError('city', 'City is required.');
        valid = false;
      }
      if (!state) {
        setError('state', 'State is required.');
        valid = false;
      }
      if (!description) {
        setError('description', 'Description is required.');
        valid = false;
      }
      if (!serviceNeeded) {
        setError('serviceNeeded', 'Please select a service.');
        valid = false;
      }
    }

    // Occupancy validation
    const occupancyStatus = form.occupancyStatus ? form.occupancyStatus.value : '';
    const entryMethod = form.entryMethod ? form.entryMethod.value.trim() : '';
    const tenantName = form.tenantName ? form.tenantName.value.trim() : '';
    const tenantPhone = form.tenantPhone ? form.tenantPhone.value.trim() : '';
    const tenantEmail = form.tenantEmail ? form.tenantEmail.value.trim() : '';

    if (selectedRole === 'client') {
      if (!occupancyStatus) {
        setError('occupancyStatus', 'Please select if property is vacant or occupied.');
        valid = false;
      }

      if (occupancyStatus === 'vacant' && !entryMethod) {
        setError('entryMethod', 'Please provide entry instructions.');
        valid = false;
      }

      if (occupancyStatus === 'occupied') {
        if (!tenantName) {
          setError('tenantName', 'Tenant name is required.');
          valid = false;
        }
        if (!tenantPhone) {
          setError('tenantPhone', 'Tenant phone is required.');
          valid = false;
        }
      }
    }

    return {
      valid,
      data: {
        role: selectedRole,
        name,
        email,
        phone,
        companyName,
        propertyAddress: selectedRole === 'client' ? propertyAddress : null,
        description: selectedRole === 'client' ? description : null,
        serviceNeeded: selectedRole === 'client' ? serviceNeeded : null,
        occupancyStatus: selectedRole === 'client' ? occupancyStatus : null,
        entryMethod: selectedRole === 'client' && occupancyStatus === 'vacant' ? entryMethod : null,
        tenantName: selectedRole === 'client' && occupancyStatus === 'occupied' ? tenantName : null,
        tenantPhone: selectedRole === 'client' && occupancyStatus === 'occupied' ? tenantPhone : null,
        tenantEmail: selectedRole === 'client' && occupancyStatus === 'occupied' ? tenantEmail : null,
        servicesOffered: null,
        appointmentDate: null
      }
    };
  }

  async function handleLeadSubmit({ redirectToPayment }) {
    hideErrorBanner();
    clearErrors();

    if (!selectedRole) {
      showStep(1);
      return;
    }

    const { valid, data } = validateForm();
    if (!valid) return;

    const submitLabel = submitBtn.textContent;
    const payLabel = payBtn ? payBtn.textContent : null;

    submitBtn.disabled = true;
    if (payBtn) payBtn.disabled = true;
    submitBtn.textContent = redirectToPayment ? 'Preparing...' : 'Submitting...';
    if (redirectToPayment && payBtn) {
      payBtn.textContent = 'Redirecting...';
    }

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error('Lead not accepted');
      }

      if (redirectToPayment) {
        const checkout = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: result.id,
            serviceName: data.serviceNeeded,
            email: data.email
          })
        });

        if (!checkout.ok) {
          throw new Error('Checkout failed');
        }

        const checkoutResult = await checkout.json();
        if (!checkoutResult.success || !checkoutResult.url) {
          throw new Error('Checkout failed');
        }

        window.location.href = checkoutResult.url;
        return;
      }

      form.reset();
      resetSuggestion();
      resetPricePreview();
      clearLocationAutofill();
      lastGeoLookupKey = '';
      showSuccess();
    } catch (error) {
      showErrorBanner();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
      if (payBtn) {
        payBtn.disabled = false;
        if (payLabel) payBtn.textContent = payLabel;
      }
    }
  }

  async function updatePricePreview() {
    const serviceName = form.serviceNeeded.value;
    if (!serviceName) {
      currentPriceCents = null;
      if (priceAmount) priceAmount.textContent = 'Select a service to see price.';
      if (suggestionGrid) {
        suggestionGrid.querySelectorAll('.suggestion-card').forEach((card) => {
          card.classList.remove('selected');
        });
      }
      return;
    }

    if (priceAmount) priceAmount.textContent = 'Calculating...';

    try {
      const response = await fetch(`/api/service-price?service=${encodeURIComponent(serviceName)}`);
      if (!response.ok) {
        throw new Error('Price unavailable');
      }
      const result = await response.json();
      currentPriceCents = result.price_cents || null;
      const priceText = result.price || formatUsd(currentPriceCents);
      if (priceAmount) priceAmount.textContent = priceText;
      if (suggestionGrid) {
        suggestionGrid.querySelectorAll('.suggestion-card').forEach((card) => {
          const title = card.querySelector('.suggestion-card-title');
          const isMatch = title && matchServiceOption(title.textContent) === serviceName;
          card.classList.toggle('selected', Boolean(isMatch));
        });
      }
    } catch (error) {
      currentPriceCents = null;
      if (priceAmount) priceAmount.textContent = 'Price unavailable';
    }
  }

  function resetPricePreview() {
    currentPriceCents = null;
    if (priceAmount) priceAmount.textContent = 'Select a service to see price.';
    if (suggestionGrid) {
      suggestionGrid.querySelectorAll('.suggestion-card').forEach((card) => {
        card.classList.remove('selected');
      });
    }
  }

  function setError(fieldName, message) {
    const group = form.querySelector(`[data-field="${fieldName}"]`);
    if (!group) return;
    group.classList.add('has-error');
    const error = group.querySelector('.error');
    if (error) error.textContent = message;
  }

  function clearFieldError(fieldName) {
    const group = form.querySelector(`[data-field="${fieldName}"]`);
    if (!group) return;
    group.classList.remove('has-error');
    const error = group.querySelector('.error');
    if (error) error.textContent = '';
  }

  function clearErrors() {
    form.querySelectorAll('.form-group').forEach((group) => {
      group.classList.remove('has-error');
      const error = group.querySelector('.error');
      if (error) error.textContent = '';
    });
  }

  function matchServiceOption(suggestion) {
    const normalized = normalizeText(suggestion);
    if (!normalized) return '';
    const options = Array.from(form.serviceNeeded.options);
    const match = options.find((option) => normalizeText(option.value) === normalized);
    return match ? match.value : '';
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function resetSuggestion() {
    if (!suggestionText) return;
    suggestionText.textContent = 'Recommendations will appear automatically.';
    suggestionText.classList.remove('suggestion-strong');
    suggestionText.classList.add('hidden');
    clearSuggestionModal();
    lastSuggestedDescription = '';
  }

  function showSuggestionModal(options, priceMap = {}) {
    if (!suggestionGrid) return;
    suggestionGrid.innerHTML = '';
    const selectedValue = form.serviceNeeded.value;

    options.forEach((option) => {
      const match = matchServiceOption(option) || option;
      const priceCents = priceMap[match];
      const priceLabel = Number.isFinite(priceCents) ? formatUsd(priceCents) : 'TBD';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'suggestion-card';
      if (selectedValue && matchServiceOption(match) === selectedValue) {
        card.classList.add('selected');
      }
      card.innerHTML = `
        <div class="suggestion-card-title">${match}</div>
        <div class="suggestion-card-price">Estimated Price: <span>${priceLabel}</span></div>
      `;
      card.addEventListener('click', () => {
        const value = matchServiceOption(match);
        if (value) {
          form.serviceNeeded.value = value;
          updatePricePreview();
        }
        suggestionGrid.querySelectorAll('.suggestion-card').forEach((item) => {
          item.classList.remove('selected');
        });
        card.classList.add('selected');
      });
      suggestionGrid.appendChild(card);
    });

    if (!suggestionGrid.childElementCount) {
      suggestionText.textContent = 'No suggestion available. Please choose a service.';
      if (suggestionEmpty) suggestionEmpty.classList.remove('hidden');
      suggestionGrid.classList.add('hidden');
      return;
    }

    suggestionGrid.classList.remove('hidden');
    if (suggestionEmpty) suggestionEmpty.classList.add('hidden');
  }

  function clearSuggestionModal() {
    if (suggestionGrid) {
      suggestionGrid.innerHTML = '';
      suggestionGrid.classList.add('hidden');
    }
    if (suggestionEmpty) {
      suggestionEmpty.classList.add('hidden');
    }
  }

  function closeSuggestionModal() {
    if (suggestionModal) {
      suggestionModal.classList.add('hidden');
    }
  }

  if (suggestionModalClose) {
    suggestionModalClose.addEventListener('click', () => {
      closeSuggestionModal();
    });
  }

  if (suggestionModal) {
    suggestionModal.addEventListener('click', (event) => {
      if (event.target === suggestionModal) {
        closeSuggestionModal();
      }
    });
  }

  function isValidEmail(email) {
    return /\S+@\S+\.\S+/.test(email);
  }

  function formatUsd(cents) {
    if (!Number.isFinite(cents)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  function showSuccess() {
    formCard.classList.add('hidden');
    successCard.classList.remove('hidden');
    progress.textContent = 'Submitted';
  }

  function showErrorBanner() {
    errorBanner.classList.remove('hidden');
  }

  function hideErrorBanner() {
    errorBanner.classList.add('hidden');
  }
});
