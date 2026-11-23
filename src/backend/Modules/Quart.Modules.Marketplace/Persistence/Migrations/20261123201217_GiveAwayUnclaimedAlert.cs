using Microsoft.EntityFrameworkCore.Migrations;
using NodaTime;

#nullable disable

namespace Quart.Modules.Marketplace.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class GiveAwayUnclaimedAlert : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Instant>(
                name: "unclaimed_alerted_at",
                schema: "marketplace",
                table: "give_away",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "unclaimed_alerted_at",
                schema: "marketplace",
                table: "give_away");
        }
    }
}
