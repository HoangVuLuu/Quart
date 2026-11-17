using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quart.Modules.Scheduling.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RelaxPublishChecks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // A shift without its required level used to block publishing by default. It now asks instead
            // (FR-144). Nobody could change the setting yet, so every stored "block" is the old default.
            migrationBuilder.Sql("""
                UPDATE scheduling.period
                SET rules = jsonb_set(rules, '{publishChecks,issue.missing_level}', '"confirm"')
                WHERE rules #>> '{publishChecks,issue.missing_level}' = 'block';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
