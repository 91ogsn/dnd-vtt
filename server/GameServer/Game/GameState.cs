namespace GameServer.Game;

public class GameState
{
    public Map Map { get; set; } = new();
    public List<Token> Tokens { get; set; } = new();
}

public class Map
{
    public string Id { get; set; } = "forest-01";
    public string ImageUrl { get; set; } = "/maps/forest.jpg";
    public int GridSize { get; set; } = 64;
}

public class Token
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = "Hero";
    public int X { get; set; }
    public int Y { get; set; }
}