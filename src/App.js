import "./App.css";
import { LEAGUE_IDS } from "./config.js";
import { api } from "./api/api.js";
import SideBar from "./components/sidebar/SideBar";
import MainContainer from "./components/main-container/MainContainer";
import { getLocalDate } from "./helper";

class App {
  constructor($target) {
    // sidebar
    this.sidebar = new SideBar({
      $target,
      onClickNav: this.handleClickNav.bind(this),
      onClickLeague: this.handleClickLeague.bind(this),
    });

    // main
    this.mainContainer = new MainContainer({
      $target,
      onClickLeague: this.handleClickLeague.bind(this),
    });

    // init cache
    api.initCache("football-dashboard").then(() => {
      // initial data
      this.initNav();
    });
  }

  initNav() {
    let leagueData = [];
    // get league names
    Promise.all(LEAGUE_IDS.map((leagueId) => api.getLeague(leagueId)))
      .then((data) => {
        leagueData = data.slice();

        // get season info
        return Promise.all(
          data.map((league) => {
            const { league_id: leagueId } = league;
            return api.getSeason(leagueId);
          })
        );
      })
      // get current season
      .then((data) => {
        const currentSeasons = data.map((league) => {
          const [current] = league.filter((season) => season.is_current);
          return current;
        });
        currentSeasons.forEach((league, i) => {
          const { season_id } = league;
          leagueData[i] = Object.assign(leagueData[i], { season_id });
        });

        this.sidebar.mainNav.renderLeague(leagueData);
      });
  }

  handleClickNav(type) {
    if (type === "custom") {
      // load custom page
    } else {
      this.sidebar.mainNav.toggleNested(type);
    }
  }

  async handleClickLeague({ leagueId, seasonId }) {
    this.sidebar.mainNav.spinner.toggle();

    // get league name and render
    const { name: leagueName } = await api.getLeague(leagueId);
    this.mainContainer.header.renderTitle(leagueName);

    // render page template
    this.mainContainer.content.renderLeaguePage({ leagueId, seasonId });

    // get standings data
    const { standings: standingsData } = await api.getStandings(
      leagueId,
      seasonId
    );

    // get teams data, parse
    const teamsDataArr = await Promise.all(
      standingsData.map((team) => api.getTeam(leagueId, team.team_id))
    );
    const teamsData = {};
    const teamsDataByName = {};
    teamsDataArr.forEach((team) => {
      const { team_id, name } = team;
      teamsData[team_id] = team;
      teamsDataByName[name] = team;
    });

    // render on nav
    this.sidebar.mainNav.renderTeam(
      teamsDataArr.sort((a, b) => a.name.localeCompare(b.name))
    );

    // 각각 => 콜백에 render
    // get standings and render
    const standingsProm = api.getStandings(leagueId, seasonId).then((data) => {
      const { standings: standingsData } = data;
      this.mainContainer.content.standings.render({
        standingsData,
        teamsData,
      });
    });

    // get match results and render
    const matchResultsProm = api
      .getMatchResults(leagueId, seasonId)
      .then((data) => {
        // filter, get local date
        const matchesData = data
          .filter((match) => match.status === "finished")
          .map((match) => {
            const { match_start_iso } = match;
            // override match start
            match.match_start = getLocalDate(match_start_iso);
            return match;
          });

        // sort
        matchesData.sort(
          (a, b) => new Date(a.match_start) - new Date(b.match_start)
        );

        // render
        this.mainContainer.content.matchResults.render(
          matchesData,
          teamsDataByName
        );
      });

    const matchUpcomingProm = api
      .getMatchUpcoming(leagueId, seasonId)
      .then((data) => {
        // filter upcoming matches
        const matchesData = data
          .filter((match) => match.status === "notstarted")
          .map((match) => {
            const { match_start_iso } = match;
            // override match start
            match.match_start = getLocalDate(match_start_iso);
            return match;
          });

        // sort
        matchesData.sort(
          (a, b) => new Date(a.match_start) - new Date(b.match_start)
        );

        this.mainContainer.content.matchUpcoming.render(
          matchesData,
          teamsDataByName
        );
      });

    const topScorersProm = api
      .getTopScorers(leagueId, seasonId)
      .then((data) => {
        const top5 = data.slice(0, 5);
        // get equals
        const topScorersData = top5.concat(
          data.slice(5).filter((player) => {
            return player.goals.overall >= top5[4].goals.overall;
          })
        );

        this.mainContainer.content.topScorers.render(
          topScorersData,
          teamsDataByName
        );
      });

    Promise.all([
      standingsProm,
      matchResultsProm,
      matchUpcomingProm,
      topScorersProm,
    ]).then(() => {
      window.scroll(0, 0);
    });
  }

  handleClickTeam({}) {}
}

export default App;
