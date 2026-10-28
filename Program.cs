using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Json;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(o => { o.Cookie.HttpOnly = true; o.Cookie.IsEssential = true; o.IdleTimeout = TimeSpan.FromHours(8); });
builder.Services.Configure<JsonOptions>(o => o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);
var app = builder.Build();
app.UseDefaultFiles(); app.UseStaticFiles(); app.UseSession();
var store = new PortalStore(Path.Combine(app.Environment.ContentRootPath, "Data", "portal.json"));
await store.LoadAsync();

app.MapGet("/api/me", (HttpContext c) => Results.Ok(store.Current(c)));
app.MapPost("/api/login", async (HttpContext c, LoginDto dto) => {
    var user = store.Users.FirstOrDefault(x => x.Username.Equals(dto.Username, StringComparison.OrdinalIgnoreCase) && x.Password == dto.Password);
    if (user is null) return Results.BadRequest(new { message = "Invalid username or password." });
    c.Session.SetString("uid", user.Id); await c.Session.CommitAsync();
    return Results.Ok(new { user.Id, user.Name, user.Username, user.Role, user.Department });
});
app.MapPost("/api/logout", (HttpContext c) => { c.Session.Clear(); return Results.Ok(new { ok = true }); });
app.MapGet("/api/exams", (HttpContext c) => {
    var me = store.Current(c); if (me is null) return Results.Unauthorized();
    var list = store.Exams.Where(e => me.Role != "Student" || e.Published).Select(e => store.ExamSummary(e, me.Id)).ToList();
    return Results.Ok(list);
});
app.MapPost("/api/exams", async (HttpContext c, ExamDto dto) => {
    var me = store.Current(c); if (me is null || me.Role == "Student") return Results.Unauthorized();
    var e = new Exam { Id = Guid.NewGuid().ToString("N"), Title = dto.Title.Trim(), Subject = dto.Subject.Trim(), Description = dto.Description ?? "", DurationMinutes = Math.Clamp(dto.DurationMinutes, 1, 240), TotalMarks = 0, NegativeMark = Math.Max(0, dto.NegativeMark), AccessCode = dto.AccessCode ?? "", StartAt = dto.StartAt, EndAt = dto.EndAt, Published = dto.Published, ShuffleQuestions = dto.ShuffleQuestions, CreatedBy = me.Id, Category = dto.Category ?? "General" };
    store.Exams.Add(e); await store.SaveAsync(); return Results.Ok(e);
});
app.MapPut("/api/exams/{id}", async (HttpContext c, string id, ExamDto dto) => {
    var me = store.Current(c); if (me is null || me.Role == "Student") return Results.Unauthorized();
    var e = store.Exams.FirstOrDefault(x => x.Id == id); if (e is null) return Results.NotFound();
    e.Title = dto.Title.Trim(); e.Subject = dto.Subject.Trim(); e.Description = dto.Description ?? ""; e.DurationMinutes = Math.Clamp(dto.DurationMinutes, 1, 240); e.NegativeMark = Math.Max(0, dto.NegativeMark); e.AccessCode = dto.AccessCode ?? ""; e.StartAt = dto.StartAt; e.EndAt = dto.EndAt; e.Published = dto.Published; e.ShuffleQuestions = dto.ShuffleQuestions; e.Category = dto.Category ?? "General";
    await store.SaveAsync(); return Results.Ok(e);
});
app.MapDelete("/api/exams/{id}", async (HttpContext c, string id) => {
    var me = store.Current(c); if (me is null || me.Role != "Admin") return Results.Unauthorized();
    store.Exams.RemoveAll(x => x.Id == id); store.Questions.RemoveAll(x => x.ExamId == id); await store.SaveAsync(); return Results.Ok(new { ok = true });
});
app.MapGet("/api/exams/{id}/questions", (HttpContext c, string id) => {
    var me = store.Current(c); if (me is null || me.Role == "Student") return Results.Unauthorized();
    return Results.Ok(store.Questions.Where(q => q.ExamId == id));
});
app.MapPost("/api/exams/{id}/questions", async (HttpContext c, string id, QuestionDto dto) => {
    var me = store.Current(c); if (me is null || me.Role == "Student") return Results.Unauthorized();
    if (!store.Exams.Any(x => x.Id == id)) return Results.NotFound();
    var q = new Question { Id = Guid.NewGuid().ToString("N"), ExamId = id, Text = dto.Text, Options = dto.Options.Where(x => !string.IsNullOrWhiteSpace(x)).Take(4).ToList(), CorrectIndex = Math.Clamp(dto.CorrectIndex, 0, 3), Marks = Math.Max(1, dto.Marks), Difficulty = dto.Difficulty ?? "Medium" };
    if (q.Options.Count != 4) return Results.BadRequest(new { message = "Provide exactly four options." });
    store.Questions.Add(q); store.RecalculateMarks(id); await store.SaveAsync(); return Results.Ok(q);
});
app.MapDelete("/api/questions/{id}", async (HttpContext c, string id) => {
    var me = store.Current(c); if (me is null || me.Role == "Student") return Results.Unauthorized();
    var q = store.Questions.FirstOrDefault(x => x.Id == id); if (q is null) return Results.NotFound(); var examId = q.ExamId; store.Questions.Remove(q); store.RecalculateMarks(examId); await store.SaveAsync(); return Results.Ok(new { ok = true });
});
app.MapPost("/api/exams/{id}/start", async (HttpContext c, string id, StartDto dto) => {
    var me = store.Current(c); if (me is null || me.Role != "Student") return Results.Unauthorized();
    var e = store.Exams.FirstOrDefault(x => x.Id == id && x.Published); if (e is null) return Results.NotFound();
    if (!string.IsNullOrEmpty(e.AccessCode) && e.AccessCode != dto.AccessCode) return Results.BadRequest(new { message = "Incorrect exam access code." });
    var now = DateTimeOffset.Now;
    if (e.StartAt is not null && now < e.StartAt || e.EndAt is not null && now > e.EndAt) return Results.BadRequest(new { message = "This examination is outside its scheduled window." });
    var previous = store.Attempts.FirstOrDefault(a => a.ExamId == id && a.StudentId == me.Id && a.SubmittedAt is not null);
    if (previous is not null) return Results.BadRequest(new { message = "You have already completed this examination." });
    var attempt = store.Attempts.FirstOrDefault(a => a.ExamId == id && a.StudentId == me.Id && a.SubmittedAt is null);
    if (attempt is null) { attempt = new Attempt { Id = Guid.NewGuid().ToString("N"), ExamId = id, StudentId = me.Id, StartedAt = now }; store.Attempts.Add(attempt); }
    var qs = store.Questions.Where(q => q.ExamId == id).ToList(); if (e.ShuffleQuestions) qs = qs.OrderBy(_ => Random.Shared.Next()).ToList();
    await store.SaveAsync();
    return Results.Ok(new { attemptId = attempt.Id, startedAt = attempt.StartedAt, durationMinutes = e.DurationMinutes, exam = store.ExamSummary(e, me.Id), questions = qs.Select(q => new { q.Id, q.Text, q.Options, q.Marks, q.Difficulty }) });
});
app.MapPost("/api/attempts/{id}/submit", async (HttpContext c, string id, SubmitDto dto) => {
    var me = store.Current(c); if (me is null || me.Role != "Student") return Results.Unauthorized();
    var a = store.Attempts.FirstOrDefault(x => x.Id == id && x.StudentId == me.Id); if (a is null) return Results.NotFound(); if (a.SubmittedAt is not null) return Results.BadRequest(new { message = "Already submitted." });
    var exam = store.Exams.First(x => x.Id == a.ExamId); var qs = store.Questions.Where(q => q.ExamId == a.ExamId).ToList();
    a.Answers = dto.Answers ?? new(); a.Warnings = Math.Max(a.Warnings, dto.Warnings); a.SubmittedAt = DateTimeOffset.Now;
    var score = 0.0; var correct = 0; var wrong = 0; var unanswered = 0;
    foreach (var q in qs) { var answer = a.Answers.FirstOrDefault(x => x.QuestionId == q.Id); if (answer is null || answer.SelectedIndex < 0) unanswered++; else if (answer.SelectedIndex == q.CorrectIndex) { score += q.Marks; correct++; } else { score -= exam.NegativeMark; wrong++; } }
    a.Score = Math.Max(0, score); a.Correct = correct; a.Wrong = wrong; a.Unanswered = unanswered; await store.SaveAsync();
    return Results.Ok(new { a.Score, exam.TotalMarks, percentage = exam.TotalMarks == 0 ? 0 : Math.Round(a.Score / exam.TotalMarks * 100, 2), a.Correct, a.Wrong, a.Unanswered, passed = a.Score >= exam.TotalMarks * .4, a.Warnings });
});
app.MapGet("/api/results", (HttpContext c) => {
    var me = store.Current(c); if (me is null) return Results.Unauthorized();
    var rows = store.Attempts.Where(a => a.SubmittedAt is not null && (me.Role != "Student" || a.StudentId == me.Id)).OrderByDescending(a => a.SubmittedAt).Select(a => new { a.Id, exam = store.Exams.FirstOrDefault(e => e.Id == a.ExamId)?.Title ?? "Deleted exam", student = store.Users.FirstOrDefault(u => u.Id == a.StudentId)?.Name ?? "Student", a.Score, totalMarks = store.Exams.FirstOrDefault(e => e.Id == a.ExamId)?.TotalMarks ?? 0, a.Correct, a.Wrong, a.Unanswered, a.Warnings, submittedAt = a.SubmittedAt, percentage = store.Exams.FirstOrDefault(e => e.Id == a.ExamId)?.TotalMarks is double t && t > 0 ? Math.Round(a.Score / t * 100, 2) : 0 }).ToList();
    return Results.Ok(rows);
});
app.MapGet("/api/stats", (HttpContext c) => {
    var me = store.Current(c); if (me is null) return Results.Unauthorized();
    var attempts = store.Attempts.Where(a => a.SubmittedAt is not null && (me.Role != "Student" || a.StudentId == me.Id)).ToList();
    return Results.Ok(new { exams = me.Role == "Student" ? store.Exams.Count(e => e.Published) : store.Exams.Count, students = store.Users.Count(u => u.Role == "Student"), attempts = attempts.Count, average = attempts.Count == 0 ? 0 : Math.Round(attempts.Average(a => a.Score), 1), pass = attempts.Count(a => { var e = store.Exams.FirstOrDefault(x => x.Id == a.ExamId); return e != null && a.Score >= e.TotalMarks * .4; }) });
});
app.MapGet("/api/leaderboard", (HttpContext c) => {
    var me = store.Current(c); if (me is null) return Results.Unauthorized();
    return Results.Ok(store.Attempts.Where(a => a.SubmittedAt != null).GroupBy(a => a.StudentId).Select(g => new { student = store.Users.FirstOrDefault(u => u.Id == g.Key)?.Name ?? "Student", totalScore = g.Sum(a => a.Score), examsTaken = g.Count() }).OrderByDescending(x => x.totalScore).Take(10));
});
app.MapGet("/api/users", (HttpContext c) => { var me = store.Current(c); if (me is null || me.Role != "Admin") return Results.Unauthorized(); return Results.Ok(store.Users.Select(u => new { u.Id, u.Name, u.Username, u.Role, u.Department })); });
app.MapPost("/api/users", async (HttpContext c, UserDto dto) => { var me = store.Current(c); if (me is null || me.Role != "Admin") return Results.Unauthorized(); if (store.Users.Any(u => u.Username == dto.Username)) return Results.BadRequest(new { message = "Username already exists." }); var u = new PortalUser { Id = Guid.NewGuid().ToString("N"), Name = dto.Name, Username = dto.Username, Password = dto.Password, Role = dto.Role, Department = dto.Department ?? "" }; store.Users.Add(u); await store.SaveAsync(); return Results.Ok(new { u.Id, u.Name, u.Username, u.Role, u.Department }); });
app.MapFallbackToFile("index.html");
app.Run();

record LoginDto(string Username, string Password);
record ExamDto(string Title, string Subject, string? Description, int DurationMinutes, double NegativeMark, string? AccessCode, DateTimeOffset? StartAt, DateTimeOffset? EndAt, bool Published, bool ShuffleQuestions, string? Category);
record QuestionDto(string Text, List<string> Options, int CorrectIndex, double Marks, string? Difficulty);
record StartDto(string? AccessCode);
record AnswerDto(string QuestionId, int SelectedIndex);
record SubmitDto(List<AnswerDto>? Answers, int Warnings);
record UserDto(string Name, string Username, string Password, string Role, string? Department);

class PortalUser { public string Id { get; set; } = ""; public string Name { get; set; } = ""; public string Username { get; set; } = ""; public string Password { get; set; } = ""; public string Role { get; set; } = "Student"; public string Department { get; set; } = ""; }
class Exam { public string Id { get; set; } = ""; public string Title { get; set; } = ""; public string Subject { get; set; } = ""; public string Description { get; set; } = ""; public string Category { get; set; } = "General"; public int DurationMinutes { get; set; } = 30; public double TotalMarks { get; set; } public double NegativeMark { get; set; } public string AccessCode { get; set; } = ""; public DateTimeOffset? StartAt { get; set; } public DateTimeOffset? EndAt { get; set; } public bool Published { get; set; } public bool ShuffleQuestions { get; set; } public string CreatedBy { get; set; } = ""; }
class Question { public string Id { get; set; } = ""; public string ExamId { get; set; } = ""; public string Text { get; set; } = ""; public List<string> Options { get; set; } = new(); public int CorrectIndex { get; set; } public double Marks { get; set; } = 1; public string Difficulty { get; set; } = "Medium"; }
class Attempt { public string Id { get; set; } = ""; public string ExamId { get; set; } = ""; public string StudentId { get; set; } = ""; public DateTimeOffset StartedAt { get; set; } public DateTimeOffset? SubmittedAt { get; set; } public List<AnswerDto> Answers { get; set; } = new(); public double Score { get; set; } public int Correct { get; set; } public int Wrong { get; set; } public int Unanswered { get; set; } public int Warnings { get; set; } }
class PortalData { public List<PortalUser> Users { get; set; } = new(); public List<Exam> Exams { get; set; } = new(); public List<Question> Questions { get; set; } = new(); public List<Attempt> Attempts { get; set; } = new(); }
class PortalStore {
    readonly string path; readonly SemaphoreSlim gate = new(1,1); PortalData data = new();
    public PortalStore(string path) { this.path = path; }
    public List<PortalUser> Users => data.Users; public List<Exam> Exams => data.Exams; public List<Question> Questions => data.Questions; public List<Attempt> Attempts => data.Attempts;
    public async Task LoadAsync() { Directory.CreateDirectory(Path.GetDirectoryName(path)!); if (File.Exists(path)) { try { data = JsonSerializer.Deserialize<PortalData>(await File.ReadAllTextAsync(path)) ?? new(); } catch { data = new(); } } if (data.Users.Count == 0) Seed(); await SaveAsync(); }
    void Seed() {
        data.Users.AddRange(new[] { new PortalUser { Id="u-admin", Name="System Administrator", Username="admin", Password="Admin@123", Role="Admin", Department="Administration" }, new PortalUser { Id="u-lecturer", Name="Dr. Priya Sharma", Username="lecturer", Password="Teach@123", Role="Lecturer", Department="Information Technology" }, new PortalUser { Id="u-student", Name="Aarav Kumar", Username="student", Password="Student@123", Role="Student", Department="Information Technology" }, new PortalUser { Id="u-student2", Name="Ananya Rao", Username="ananya", Password="Student@123", Role="Student", Department="Computer Science" } });
        var e = new Exam { Id="exam-demo", Title="C# & OOP Fundamentals", Subject="Programming with Objects", Description="A sample assessment covering classes, objects, inheritance and polymorphism.", Category="Programming", DurationMinutes=20, Published=true, ShuffleQuestions=true, CreatedBy="u-lecturer", NegativeMark=.25, AccessCode="", TotalMarks=10 }; data.Exams.Add(e);
        var qs = new[] { ("Which keyword is used to create an object in C#?", new[]{"new","class","this","base"},0), ("Which OOP concept hides internal implementation details?",new[]{"Inheritance","Encapsulation","Polymorphism","Overloading"},1), ("Which access modifier makes a member accessible only within its class?",new[]{"public","protected","private","internal"},2), ("Which symbol is used for inheritance in C#?",new[]{":","->","extends","implements"},0), ("Which method has the same name as its class?",new[]{"Destructor","Constructor","Static method","Main"},1), ("Which keyword prevents a class from being inherited?",new[]{"static","sealed","abstract","virtual"},1), ("Which feature allows one interface with many implementations?",new[]{"Encapsulation","Abstraction","Polymorphism","Compilation"},2), ("Which collection stores key-value pairs?",new[]{"List","Queue","Dictionary","Stack"},2), ("Which keyword refers to the current object?",new[]{"base","this","self","current"},1), ("Which block handles exceptions?",new[]{"try-catch","if-else","for-loop","switch"},0) };
        foreach (var q in qs) data.Questions.Add(new Question { Id=Guid.NewGuid().ToString("N"), ExamId=e.Id, Text=q.Item1, Options=q.Item2.ToList(), CorrectIndex=q.Item3, Marks=1, Difficulty="Easy" });
    }
    public async Task SaveAsync() { await gate.WaitAsync(); try { await File.WriteAllTextAsync(path, JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented=true })); } finally { gate.Release(); } }
    public PortalUser? Current(HttpContext c) { var id=c.Session.GetString("uid"); return Users.FirstOrDefault(u=>u.Id==id); }
    public object ExamSummary(Exam e, string uid) => new { e.Id,e.Title,e.Subject,e.Description,e.Category,e.DurationMinutes,e.TotalMarks,e.NegativeMark,hasAccessCode=!string.IsNullOrEmpty(e.AccessCode),e.StartAt,e.EndAt,e.Published,e.ShuffleQuestions,questionCount=Questions.Count(q=>q.ExamId==e.Id),attempted=Attempts.Any(a=>a.ExamId==e.Id&&a.StudentId==uid&&a.SubmittedAt!=null),participants=Attempts.Count(a=>a.ExamId==e.Id&&a.SubmittedAt!=null) };
    public void RecalculateMarks(string id) { var e=Exams.FirstOrDefault(x=>x.Id==id); if(e!=null)e.TotalMarks=Questions.Where(q=>q.ExamId==id).Sum(q=>q.Marks); }
}
