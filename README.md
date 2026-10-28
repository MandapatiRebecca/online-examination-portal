# ExamNex — Smart Online Examination & Assessment Portal

A C# / ASP.NET Core 8 web application demonstrating object-oriented programming, role-based workflows and an online examination lifecycle.

## Features
- Role-based sign-in for Admin, Lecturer and Student
- Separate dashboards and navigation
- Lecturer exam creation, publishing, scheduling and access codes
- Question bank with four-option MCQs, difficulty and marks
- Randomized question order, negative marking and timed assessments
- Question palette, previous/next navigation and mark-for-review
- Tab visibility warnings (a deterrent/log only, not secure proctoring)
- Automatic scoring and submission at timer expiry
- Student results, lecturer reports, leaderboard and basic analytics
- Admin user management
- JSON file persistence in `Data/portal.json` (no database installation required)
- Responsive layout for desktop and mobile

## Requirements
- Windows 10/11
- .NET 8 SDK
- Visual Studio 2022 (ASP.NET and web development workload) or VS Code

## Run in Visual Studio
1. Extract the ZIP.
2. Open `ExamNex.csproj` in Visual Studio 2022.
3. Allow restore/build, then press **F5**.
4. The app opens in your browser. The data file is created automatically on first run.

## Run from terminal
Open a terminal in the `ExamNex` folder and run:

```bash
dotnet restore
dotnet run
```

Open the localhost URL printed in the terminal.

## Demo logins
| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Lecturer | `lecturer` | `Teach@123` |
| Student | `student` | `Student@123` |
| Student | `ananya` | `Student@123` |

## Suggested demonstration flow
1. Sign in as lecturer and open **Examinations**.
2. Create an exam, choose whether to publish it, set a duration, negative marks and optional access code.
3. Add MCQ questions in the question bank.
4. Sign out and sign in as student.
5. Start the published exam, answer questions, mark one for review and submit.
6. Show the automatic scorecard, then sign in as lecturer to view **Results & Reports** and **Leaderboard**.
7. Sign in as admin to demonstrate **User Management**.

## Important project notes
- This is a college demonstration project, not a production examination service.
- Demo passwords are stored as plain text in the local JSON data file. Replace this with ASP.NET Core Identity and secure password hashing before real deployment.
- Tab-switch detection is a browser-side warning and can be bypassed; it is not certified proctoring.
- Answers are submitted to the server at final submission; refreshing or closing the browser during an attempt may lose in-progress answers. A production version should persist each answer server-side as it changes.
- The 40% pass threshold is a sample rule and can be customized.
