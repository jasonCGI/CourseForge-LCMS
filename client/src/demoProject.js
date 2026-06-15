// Demo project seeded automatically on startup when the DB has no projects,
// so testing always begins with content loaded. See App.jsx DEMO_AUTOLOAD.
// CourseForge import schema v1.0.
const demoProject = {
  schema_version: '1.0',
  project_name: 'Demo Project',
  project_description: 'Auto-loaded demo for testing the editor. Safe to delete.',
  courses: [
    {
      course_name: 'Getting Started',
      modules: [
        {
          module_name: 'Orientation',
          lessons: [
            {
              lesson_name: 'Welcome',
              frames: [
                {
                  frame_name: 'Welcome',
                  frame_type: 'content',
                  narration: 'Welcome to the CourseForge demo project.',
                  media: [],
                  knowledge_check: null,
                  branch: null,
                },
                {
                  frame_name: 'How it works',
                  frame_type: 'content',
                  narration: 'Click a frame in the sidebar to edit it.',
                  media: [
                    { kind: 'image', placeholder_label: 'overview_diagram', caption: 'Overview' },
                  ],
                  knowledge_check: null,
                  branch: null,
                },
                {
                  frame_name: 'Quick Check',
                  frame_type: 'assessment',
                  narration: null,
                  media: [],
                  knowledge_check: {
                    question: 'What does CourseForge author?',
                    choices: ['Spreadsheets', 'Web-based courseware', 'Email', 'Invoices'],
                    correct_index: 1,
                    feedback_correct: 'Correct.',
                    feedback_incorrect: 'Review the intro.',
                  },
                  branch: null,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

export default demoProject
