using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quart.Modules.Scheduling.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AssignmentStartsEarly : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "starts_early",
                schema: "scheduling",
                table: "assignment",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "starts_early",
                schema: "scheduling",
                table: "assignment");
        }
    }
}
