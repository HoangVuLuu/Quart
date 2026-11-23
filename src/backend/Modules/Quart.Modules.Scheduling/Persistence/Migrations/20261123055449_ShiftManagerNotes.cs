using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quart.Modules.Scheduling.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ShiftManagerNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "draft_note",
                schema: "scheduling",
                table: "shift",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "note",
                schema: "scheduling",
                table: "shift",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "draft_note",
                schema: "scheduling",
                table: "shift");

            migrationBuilder.DropColumn(
                name: "note",
                schema: "scheduling",
                table: "shift");
        }
    }
}
