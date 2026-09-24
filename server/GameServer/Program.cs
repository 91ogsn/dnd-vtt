using GameServer.Game;
using GameServer.Hubs;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddSingleton<GameState>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy
            .WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

app.UseCors();

var state = app.Services.GetRequiredService<GameState>();

// Startdata
state.Tokens.Add(new Token
{
    Name = "Staffan",
    X = 3,
    Y = 3
});

app.MapGet("/state", () => state);

app.MapHub<GameHub>("/gamehub");

app.Run();