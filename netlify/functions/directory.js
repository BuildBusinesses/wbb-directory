// netlify/functions/directory.js
// Secure serverless backend: fetches ACTIVE member submissions from JotForm
// and returns a normalized member list for the WBB frontend directory widget.

const JOTFORM_FORM_ID = '242347443170149';
const JOTFORM_SUBMISSIONS_LIMIT = 1000;

exports.handler = async function directoryHandler(event, context) {
  const responseHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Content-Type': 'application/json'
  };

  try {
    const jotformApiKey = process.env.JOTFORM_API_KEY;
    const jotformSubmissionsUrl =
      `https://api.jotform.com/form/${JOTFORM_FORM_ID}/submissions` +
      `?apiKey=${jotformApiKey}&limit=${JOTFORM_SUBMISSIONS_LIMIT}`;

    const jotformResponse = await fetch(jotformSubmissionsUrl);

    if (!jotformResponse.ok) {
      return {
        statusCode: jotformResponse.status,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Jotform API error' })
      };
    }

    const jotformData = await jotformResponse.json();

    const activeMembers = jotformData.content
      .filter(submission => submission.status === 'ACTIVE')
      .map(submission => {
        const submissionAnswers = submission.answers;
        const answersByLabel = {};

        for (const answerKey in submissionAnswers) {
          const answer = submissionAnswers[answerKey];
          if (answer.text) {
            answersByLabel[answer.text.toLowerCase().trim()] = answer.answer;
          }
        }

        return {
          id: submission.id,
          dateCreated: submission.created_at,
          name: answersByLabel['name'] || '',
          businessName: answersByLabel['business name'] || '',
          photo: answersByLabel['photo'] || '',
          status: answersByLabel['status'] || 'Active'
        };
      });

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify(activeMembers)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
    };
  }
};
