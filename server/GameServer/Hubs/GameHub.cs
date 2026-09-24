using Microsoft.AspNetCore.SignalR;
using GameServer.Game;

namespace GameServer.Hubs;

public class GameHub : Hub
{
    private readonly GameState _state;

    public GameHub(GameState state)
    {
        _state = state;
    }

    public async Task MoveToken(string tokenId, int x, int y)
    {
        var token = _state.Tokens.FirstOrDefault(t => t.Id == tokenId);
        if (token == null) return;

        token.X = x;
        token.Y = y;

        await Clients.All.SendAsync("TokenMoved", token);
    }
}