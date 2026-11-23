using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quart.Modules.Workplaces.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ShiftNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "name",
                schema: "workplaces",
                table: "shift_block",
                type: "character varying(24)",
                maxLength: 24,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "name",
                schema: "workplaces",
                table: "shift_block");
        }
    }
}
