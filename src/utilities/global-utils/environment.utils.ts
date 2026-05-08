// 1. Set IS_LOCAL to true when you are running Locally
// 2. Set LOCAL_ENV (Optional) to EEnvironmentModes only if you want any other Environment than Stage.
// 3. Set IS_LOCAL_MC_BE (Optional) to true if you want to hit the Internal API calls locally on Node.

export enum EEnvironmentModes {
    stage = "stage",
    prod = "prod",
}

// This determines the Environment you want to run the app in (EEnvironmentModes).
const is_live_production_server = process.env.IS_PRODUCTION_SERVER?.toLowerCase() === "true";
const env_mode = is_live_production_server ? EEnvironmentModes.prod : <EEnvironmentModes>EEnvironmentModes.stage;

console.log(`Running in ${env_mode} Mode`);
// Only turn this on Production Server (DO NOT TOUCH)!!
const is_live: boolean = is_live_production_server || env_mode === EEnvironmentModes.prod;



// This determines if the app is running locally
const is_local = process.env.IS_LOCAL?.toLowerCase() === "true";
const config_env_file_path = process.env.CONFIG_ENV_FILE_PATH || (is_live ? ".prod_env" : ".stage_env");
console.log(`Using Environment Variables from ${config_env_file_path}`);
require("dotenv").config({path: config_env_file_path});

interface IEnvironmentConn {
    // DATABASE Connectors (depends on local/docker/live)
    primary_pg_db_host: string;
    primary_pg_db_port: number;
    primary_pg_db_user: string;
    primary_pg_db_pass: string;
    primary_pg_db_database: string;

    redis_host: string;
    redis_pass: string;

}


interface IEnvironmentSecrets {
    // URL
    // s3_base_url: string;


    // Comm Channels Partner
    bug_slack_channel_url: string;



}

interface IEnvironment extends  IEnvironmentConn, IEnvironmentSecrets {
    env_mode: EEnvironmentModes;
    is_live: boolean; // Boolean flag to determine if running on Prod Mode (connected to Prod DB etc)
    is_local?: boolean; // Boolean flag to determine if running on Local Mode
    is_live_production_server?: boolean; // Boolean flag to determine if running on Prod EC2
}

const get_connectors = (): IEnvironmentConn => {
    const db_ip = "";


    let db_password_prefix = "";
    let db_host_prefix = "";

    const primary_pg_db_user = "";
    const primary_pg_db_database = "";
    const primary_pg_db_pass = process.env.DB_PASSWORD;
    let db_pri_port = is_local ? 5632 : 5432;
    const redis_host = is_live ? "" : db_ip;

    let db_host = is_local ? db_ip : "";

    let be_url_pointer_prefix = is_live ? "" : "staging-";

    if (!is_live) {
        if (env_mode != EEnvironmentModes.stage) {
            db_password_prefix = env_mode;
            be_url_pointer_prefix = `staging-${env_mode}-`;

        }

        if (is_local) {
            db_host = db_ip;
            switch (env_mode) {
                case EEnvironmentModes.stage:
                    db_pri_port = 5632;
                    break;
                default:
                    break;
            }
        } else {
            if (env_mode != EEnvironmentModes.stage) {
                db_host_prefix = env_mode + "-";
                db_host = db_host_prefix + db_host;
            }
        }
    }


    return {

        primary_pg_db_host: db_host,
        primary_pg_db_port: db_pri_port,
        primary_pg_db_user,
        primary_pg_db_pass: db_password_prefix + primary_pg_db_pass,
        primary_pg_db_database,
        redis_host: is_local ? db_ip : 'redis',
        redis_pass: process.env.REDIS_PASSWORD,
    };
};


const get_cred_secrets = (): IEnvironmentSecrets => {
    const common_creds = {

    };


    const stage_creds: IEnvironmentSecrets = {
        ...common_creds,
        bug_slack_channel_url: "",

    };
    const prod_creds: IEnvironmentSecrets = {
        ...common_creds,
        bug_slack_channel_url: "",

    };

    return is_live ? prod_creds : stage_creds;
};


export const get_environment = (): IEnvironment => {
    return {
        env_mode,
        is_live,
        is_local,
        is_live_production_server,
        ...get_connectors(),
        ...get_cred_secrets(),
    };
};



