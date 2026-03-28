const axios = require('axios');

const API_KEY = 'ak_013c9caaeb41e3bb07ab6aae4b1b7e11699876db0b870ce8';
const BASE_URL = 'https://assessment.ksensetech.com/api';

const results = {
    high_risk_patients: [],
    fever_patients: [],
    data_quality_issues: []
};

// Helper function to handle API calls with retries
async function fetchPage(page) {
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const response = await axios.get(`${BASE_URL}/patients`, {
                headers: { 'x-api-key': API_KEY },
                params: { page, limit: 10 }
            });
            return response.data;
        } catch (error) {
            if (error.response && (error.response.status === 429 || error.response.status >= 500)) {
                console.log(`Error ${error.response.status}. Retrying in ${attempt}s...`);
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            } else {
                return null;
            }
        }
    }
}

async function startAssessment() {
    let currentPage = 1;
    let hasNext = true;

    while (hasNext) {
        console.log(`Processing Page ${currentPage}...`);
        const data = await fetchPage(currentPage);
        if (!data) break;

        data.data.forEach(patient => {
            let isInvalid = false;
            let bpScore = 0;
            let tempScore = 0;
            let ageScore = 0;

            // 1. Blood Pressure Logic
            const bp = String(patient.blood_pressure || "");
            const bpMatch = bp.match(/^(\d+)\/(\d+)$/);
            if (bpMatch) {
                const sys = parseInt(bpMatch[1]);
                const dia = parseInt(bpMatch[2]);
                if (sys >= 140 || dia >= 90) bpScore = 4;
                else if (sys >= 130 || dia >= 80) bpScore = 3;
                else if (sys >= 120 && dia < 80) bpScore = 2;
                else if (sys < 120 && dia < 80) bpScore = 1;
            } else {
                isInvalid = true;
            }

            // 2. Temperature Logic
            const temp = parseFloat(patient.temperature);
            if (!isNaN(temp)) {
                if (temp >= 99.6) results.fever_patients.push(patient.patient_id);
                if (temp >= 101.0) tempScore = 2;
                else if (temp >= 99.6) tempScore = 1;
            } else {
                isInvalid = true;
            }

            // 3. Age Logic
            const age = parseInt(patient.age);
            if (!isNaN(age)) {
                if (age > 65) ageScore = 2;
                else ageScore = 1;
            } else {
                isInvalid = true;
            }

            // 4. Tallying Results
            if (isInvalid) results.data_quality_issues.push(patient.patient_id);
            if ((bpScore + tempScore + ageScore) >= 4) {
                results.high_risk_patients.push(patient.patient_id);
            }
        });

        hasNext = data.pagination.hasNext;
        currentPage++;
    }

    // Final Submission
    console.log("Submitting Assessment...");
    try {
        const submission = await axios.post(`${BASE_URL}/submit-assessment`, results, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log("SUCCESS:", JSON.stringify(submission.data, null, 2));
    } catch (error) {
        console.error("Submission Failed:", error.response ? error.response.data : error.message);
    }
}

startAssessment();