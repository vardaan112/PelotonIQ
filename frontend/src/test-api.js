// Simple test script to check API connectivity
const testAPI = async () => {
  try {
    console.log('Testing API connection...');
    const response = await fetch('/api/v1/riders');
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json();
      console.log('API Response:', data);
      console.log('✅ API is working correctly!');
    } else {
      console.error('❌ API responded with error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error body:', errorText);
    }
  } catch (error) {
    console.error('❌ Network/Fetch error:', error.message);
    console.error('Full error:', error);
  }
};

// Run the test
testAPI();